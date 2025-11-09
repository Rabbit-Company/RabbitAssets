import type { AssetMetrics } from "./types";

export interface MetricsOptions {
	enableTimestamps?: boolean;
	includeHelp?: boolean;
	portfolioLabels?: Record<string, string>;
}

const EXCHANGE_TYPE_MAPPING: Record<string, string> = {
	fiat: "fiat",
	metal: "metal",
	crypto: "crypto",
	stock: "stock",
};

export namespace MetricsExporter {
	export function generateOpenMetrics(metrics: AssetMetrics[], options: MetricsOptions = {}): string {
		const { enableTimestamps = false, includeHelp = true, portfolioLabels = {} } = options;

		const lines: string[] = [];
		const timestamp = Date.now() / 1000;

		// Group metrics by owner first
		const metricsByOwner = new Map<string, AssetMetrics[]>();
		metrics.forEach((metric) => {
			if (!metricsByOwner.has(metric.owner)) {
				metricsByOwner.set(metric.owner, []);
			}
			metricsByOwner.get(metric.owner)!.push(metric);
		});

		// Add HELP and TYPE metadata
		if (includeHelp) {
			lines.push(
				"# HELP asset_price Current price of the asset in the specified currency",
				"# TYPE asset_price gauge",
				"# HELP asset_quantity Quantity of the asset held",
				"# TYPE asset_quantity gauge",
				"# HELP asset_value Total value of the asset holding in the specified currency",
				"# TYPE asset_value gauge",
				"# HELP asset_value_percentage Percentage of total portfolio value for this asset",
				"# TYPE asset_value_percentage gauge",
				"# HELP portfolio_total_value Total value of all assets in the portfolio",
				"# TYPE portfolio_total_value gauge",
				"# HELP portfolio_assets Total number of assets in the portfolio",
				"# TYPE portfolio_assets gauge",
				"# HELP portfolio_currency_percentage Percentage of portfolio value by currency",
				"# TYPE portfolio_currency_percentage gauge",
				"# HELP portfolio_asset_type_value Total value of assets by type",
				"# TYPE portfolio_asset_type_value gauge",
				"# HELP portfolio_asset_type_percentage Percentage of portfolio value by asset type",
				"# TYPE portfolio_asset_type_percentage gauge"
			);
		}

		// Generate metrics per owner
		for (const [owner, ownerMetrics] of metricsByOwner) {
			// Calculate total value for this owner
			const ownerTotalValue = ownerMetrics.reduce((sum, metric) => sum + metric.value, 0);

			// Calculate asset type metrics for this owner (grouped by currency)
			const ownerAssetTypeMetrics = calculateAssetTypeMetricsForOwner(ownerMetrics);

			// Generate asset-specific metrics for this owner
			ownerMetrics.forEach((metric) => {
				const baseLabels = `symbol="${escapeLabelValue(metric.symbol)}",currency="${escapeLabelValue(metric.currency)}",owner="${escapeLabelValue(
					metric.owner
				)}",exchange="${escapeLabelValue(metric.exchange)}"`;
				const valuePercentage = ownerTotalValue > 0 ? (metric.value / ownerTotalValue) * 100 : 0;
				const timestampSuffix = enableTimestamps ? ` ${timestamp}` : "";

				// Asset price
				lines.push(`asset_price{${baseLabels}} ${metric.currentPrice}${timestampSuffix}`);

				// Asset quantity
				lines.push(`asset_quantity{${baseLabels}} ${metric.quantity}${timestampSuffix}`);

				// Asset value
				lines.push(`asset_value{${baseLabels}} ${metric.value}${timestampSuffix}`);

				// Asset value as percentage of owner's portfolio
				lines.push(`asset_value_percentage{${baseLabels}} ${valuePercentage}${timestampSuffix}`);
			});

			// Add portfolio-level metrics for this owner
			if (ownerMetrics.length > 0) {
				const portfolioLabelsStr = generatePortfolioLabels({ ...portfolioLabels, owner });
				const timestampSuffix = enableTimestamps ? ` ${timestamp}` : "";

				// Total portfolio value for this owner
				lines.push(`portfolio_total_value{${portfolioLabelsStr}} ${ownerTotalValue}${timestampSuffix}`);

				// Portfolio asset count for this owner
				lines.push(`portfolio_assets{${portfolioLabelsStr}} ${ownerMetrics.length}${timestampSuffix}`);

				// Currency distribution for this owner
				const currencyDistribution = calculateCurrencyDistribution(ownerMetrics);
				Object.entries(currencyDistribution).forEach(([currency, percentage]) => {
					lines.push(`portfolio_currency_percentage{${portfolioLabelsStr},currency="${escapeLabelValue(currency)}"} ${percentage}${timestampSuffix}`);
				});

				Object.entries(ownerAssetTypeMetrics.byTypeAndCurrency).forEach(([assetType, currencyData]) => {
					Object.entries(currencyData).forEach(([currency, value]) => {
						const labels = `owner="${escapeLabelValue(owner)}",asset_type="${escapeLabelValue(assetType)}",currency="${escapeLabelValue(currency)}"`;
						const percentage = ownerTotalValue > 0 ? (value / ownerTotalValue) * 100 : 0;

						lines.push(`portfolio_asset_type_value{${labels}} ${value}${timestampSuffix}`);
						lines.push(`portfolio_asset_type_percentage{${labels}} ${percentage}${timestampSuffix}`);
					});
				});
			}
		}

		lines.push("# EOF");

		return lines.join("\n");
	}

	export function generatePrometheusFormat(metrics: AssetMetrics[]): string {
		return generateOpenMetrics(metrics, { includeHelp: true, enableTimestamps: false });
	}

	export function generateSummary(metrics: AssetMetrics[]): {
		totalValue: number;
		assetCount: number;
		currencyBreakdown: Record<string, number>;
		assetTypeBreakdown: Record<string, { value: number; percentage: number }>;
		topAssets: Array<{ symbol: string; value: number; percentage: number; owner: string }>;
		owners: Record<
			string,
			{
				totalValue: number;
				assetCount: number;
				currencyBreakdown: Record<string, number>;
				assetTypeBreakdown: Record<string, { value: number; percentage: number }>;
			}
		>;
	} {
		// Group by owner first
		const metricsByOwner = new Map<string, AssetMetrics[]>();
		metrics.forEach((metric) => {
			if (!metricsByOwner.has(metric.owner)) {
				metricsByOwner.set(metric.owner, []);
			}
			metricsByOwner.get(metric.owner)!.push(metric);
		});

		// Calculate per-owner summaries
		const owners: Record<
			string,
			{
				totalValue: number;
				assetCount: number;
				currencyBreakdown: Record<string, number>;
				assetTypeBreakdown: Record<string, { value: number; percentage: number }>;
			}
		> = {};

		for (const [owner, ownerMetrics] of metricsByOwner) {
			const ownerTotalValue = ownerMetrics.reduce((sum, metric) => sum + metric.value, 0);
			const ownerCurrencyBreakdown: Record<string, number> = {};
			const ownerAssetTypeMetrics = calculateAssetTypeMetricsForOwner(ownerMetrics);

			ownerMetrics.forEach((metric) => {
				ownerCurrencyBreakdown[metric.currency] = (ownerCurrencyBreakdown[metric.currency] || 0) + metric.value;
			});

			owners[owner] = {
				totalValue: ownerTotalValue,
				assetCount: ownerMetrics.length,
				currencyBreakdown: ownerCurrencyBreakdown,
				assetTypeBreakdown: ownerAssetTypeMetrics.byType,
			};
		}

		// Global totals (across all owners)
		const totalValue = metrics.reduce((sum, metric) => sum + metric.value, 0);

		// Asset type breakdown across all owners
		const allAssetTypeMetrics = calculateAssetTypeMetricsForOwner(metrics);

		// Top assets across all owners
		const topAssets = metrics
			.map((metric) => ({
				symbol: metric.symbol,
				value: metric.value,
				percentage: totalValue > 0 ? (metric.value / totalValue) * 100 : 0,
				owner: metric.owner,
			}))
			.sort((a, b) => b.value - a.value)
			.slice(0, 10);

		return {
			totalValue,
			assetCount: metrics.length,
			currencyBreakdown: calculateCurrencyDistribution(metrics), // Global distribution
			assetTypeBreakdown: allAssetTypeMetrics.byType,
			topAssets,
			owners,
		};
	}

	// Helper functions
	function escapeLabelValue(value: string): string {
		return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
	}

	function generatePortfolioLabels(customLabels: Record<string, string>): string {
		const labels = { ...customLabels };
		return Object.entries(labels)
			.map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
			.join(",");
	}

	function calculateCurrencyDistribution(metrics: AssetMetrics[]): Record<string, number> {
		const totalValue = metrics.reduce((sum, metric) => sum + metric.value, 0);
		const distribution: Record<string, number> = {};

		if (totalValue > 0) {
			metrics.forEach((metric) => {
				distribution[metric.currency] = (distribution[metric.currency] || 0) + metric.value;
			});

			// Convert to percentages
			Object.keys(distribution).forEach((currency) => {
				distribution[currency] = (distribution[currency]! / totalValue) * 100;
			});
		}

		return distribution;
	}

	function calculateAssetTypeMetricsForOwner(metrics: AssetMetrics[]): {
		byType: Record<string, { value: number; percentage: number }>;
		byTypeAndCurrency: Record<string, Record<string, number>>;
	} {
		const byType: Record<string, { value: number; percentage: number }> = {};
		const byTypeAndCurrency: Record<string, Record<string, number>> = {};

		const totalValue = metrics.reduce((sum, metric) => sum + metric.value, 0);

		metrics.forEach((metric) => {
			const assetType = EXCHANGE_TYPE_MAPPING[metric.exchange] || "other";
			const currency = metric.currency;

			if (!byType[assetType]) byType[assetType] = { value: 0, percentage: 0 };
			if (!byTypeAndCurrency[assetType]) byTypeAndCurrency[assetType] = {};
			if (!byTypeAndCurrency[assetType][currency]) byTypeAndCurrency[assetType][currency] = 0;

			byType[assetType].value += metric.value;
			byTypeAndCurrency[assetType][currency] += metric.value;
		});

		Object.keys(byType).forEach((type) => {
			byType[type]!.percentage = totalValue > 0 ? (byType[type]!.value / totalValue) * 100 : 0;
		});

		return {
			byType,
			byTypeAndCurrency,
		};
	}
}
