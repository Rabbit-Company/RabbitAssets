import type { AssetMetrics } from "./types";

export interface MetricsOptions {
	enableTimestamps?: boolean;
	includeHelp?: boolean;
	portfolioLabels?: Record<string, string>;
}

export namespace MetricsExporter {
	export function generateOpenMetrics(metrics: AssetMetrics[], options: MetricsOptions = {}): string {
		const { enableTimestamps = true, includeHelp = true, portfolioLabels = {} } = options;

		const lines: string[] = [];
		const timestamp = Date.now();
		let totalValue = 0;

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
				""
			);
		}

		// Calculate total value first
		metrics.forEach((metric) => {
			totalValue += metric.value;
		});

		// Generate asset-specific metrics
		metrics.forEach((metric) => {
			const baseLabels = `symbol="${escapeLabelValue(metric.symbol)}",currency="${escapeLabelValue(metric.currency)}"`;
			const valuePercentage = totalValue > 0 ? (metric.value / totalValue) * 100 : 0;
			const timestampSuffix = enableTimestamps ? ` ${timestamp}` : "";

			// Asset price
			lines.push(`asset_price{${baseLabels}} ${metric.currentPrice}${timestampSuffix}`);

			// Asset quantity
			lines.push(`asset_quantity{${baseLabels}} ${metric.quantity}${timestampSuffix}`);

			// Asset value
			lines.push(`asset_value{${baseLabels}} ${metric.value}${timestampSuffix}`);

			// Asset value as percentage of portfolio
			lines.push(`asset_value_percentage{${baseLabels}} ${valuePercentage}${timestampSuffix}`);
		});

		// Add portfolio-level metrics
		if (metrics.length > 0) {
			const portfolioLabelsStr = generatePortfolioLabels(portfolioLabels);
			const timestampSuffix = enableTimestamps ? ` ${timestamp}` : "";

			// Total portfolio value
			lines.push(`portfolio_total_value{${portfolioLabelsStr}} ${totalValue}${timestampSuffix}`);

			// Portfolio asset count
			lines.push(`portfolio_assets{${portfolioLabelsStr}} ${metrics.length}${timestampSuffix}`);

			// Currency distribution
			const currencyDistribution = calculateCurrencyDistribution(metrics);
			Object.entries(currencyDistribution).forEach(([currency, percentage]) => {
				lines.push(`portfolio_currency_percentage{${portfolioLabelsStr},currency="${escapeLabelValue(currency)}"} ${percentage}${timestampSuffix}`);
			});
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
		topAssets: Array<{ symbol: string; value: number; percentage: number }>;
	} {
		const totalValue = metrics.reduce((sum, metric) => sum + metric.value, 0);

		// Currency breakdown
		const currencyBreakdown: Record<string, number> = {};
		metrics.forEach((metric) => {
			currencyBreakdown[metric.currency] = (currencyBreakdown[metric.currency] || 0) + metric.value;
		});

		// Top assets by value
		const topAssets = metrics
			.map((metric) => ({
				symbol: metric.symbol,
				value: metric.value,
				percentage: totalValue > 0 ? (metric.value / totalValue) * 100 : 0,
			}))
			.sort((a, b) => b.value - a.value)
			.slice(0, 10);

		return {
			totalValue,
			assetCount: metrics.length,
			currencyBreakdown,
			topAssets,
		};
	}

	// Helper functions
	function escapeLabelValue(value: string): string {
		return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
	}

	function generatePortfolioLabels(customLabels: Record<string, string>): string {
		const defaultLabels = {
			portfolio: "default",
			version: "1.0",
		};

		const labels = { ...defaultLabels, ...customLabels };
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
}
