import { BaseExchange } from "./exchanges/base-exchange";
import { FiatExchange } from "./exchanges/fiat";
import { MetalExchange } from "./exchanges/metal";
import { CryptoExchange } from "./exchanges/crypto";
import { StockExchange } from "./exchanges/stock";
import type { AssetConfig, ConfigType, AssetMetrics, PriceData } from "./types";
import { FiatService } from "./services/fiat-service";
import { Logger } from "./logger";

interface ExchangeConstructor {
	new (): BaseExchange;
}

const EXCHANGE_REGISTRY: Record<string, ExchangeConstructor> = {
	fiat: FiatExchange,
	metal: MetalExchange,
	crypto: CryptoExchange,
	stock: StockExchange,
};

export class MonitorManager {
	private exchanges = new Map<string, BaseExchange>();
	private assetsByExchange = new Map<string, AssetConfig[]>();
	private fiatService: FiatService;
	private pollInterval = 30000; // 30 seconds
	private intervalId?: NodeJS.Timeout;

	constructor() {
		this.fiatService = new FiatService();
	}

	async initialize(config: ConfigType): Promise<void> {
		await this.fiatService.initialize();

		// Group assets by exchange
		config.assets.forEach((asset) => {
			if (!this.assetsByExchange.has(asset.exchange)) {
				this.assetsByExchange.set(asset.exchange, []);
			}
			this.assetsByExchange.get(asset.exchange)!.push(asset);
		});

		for (const [exchangeName, assets] of this.assetsByExchange) {
			const exchange = this.createExchange(exchangeName);
			if (exchange) {
				this.exchanges.set(exchangeName, exchange);

				exchange.on("priceUpdate", (priceData: PriceData) => {
					Logger.silly(`Price update from ${exchangeName}: ${priceData.symbol} = ${priceData.price} ${priceData.currency}`);
				});

				const symbols = [...new Set(assets.map((a) => a.symbol))];
				await exchange.updatePrices(symbols);
				Logger.info(`Initialized ${exchangeName} exchange with symbols: ${symbols.join(", ")}`);
			} else {
				Logger.warn(`Unsupported exchange: ${exchangeName}. Assets: ${assets.map((a) => a.symbol).join(", ")}`);
			}
		}

		this.startPolling();
		Logger.info(`Started polling all exchanges every ${this.pollInterval}ms`);
	}

	private createExchange(exchangeName: string): BaseExchange | null {
		const ExchangeClass = EXCHANGE_REGISTRY[exchangeName];
		if (!ExchangeClass) {
			return null;
		}
		return new ExchangeClass();
	}

	private startPolling(): void {
		this.intervalId = setInterval(() => {
			this.pollAllExchanges();
		}, this.pollInterval);
	}

	private async pollAllExchanges(): Promise<void> {
		const promises = Array.from(this.exchanges.entries()).map(async ([exchangeName, exchange]) => {
			const assets = this.assetsByExchange.get(exchangeName) || [];
			const symbols = [...new Set(assets.map((a) => a.symbol))];

			if (symbols.length > 0) {
				await exchange.updatePrices(symbols);
			}
		});

		await Promise.allSettled(promises);
	}

	public getAssetMetrics(): AssetMetrics[] {
		const allMetrics: AssetMetrics[] = [];

		for (const [exchangeName, assets] of this.assetsByExchange) {
			const exchange = this.exchanges.get(exchangeName);
			if (!exchange) continue;

			for (const asset of assets) {
				const priceData = exchange.getPrice(asset.symbol);
				if (priceData && priceData.price > 0) {
					let price = priceData.price;
					let displayCurrency = asset.currency;

					// Convert to desired currency if currencies differ
					if (priceData.currency !== displayCurrency) {
						try {
							price = this.fiatService.convert(price, priceData.currency, displayCurrency);
						} catch (error: any) {
							displayCurrency = priceData.currency;
							Logger.warn(`Currency conversion failed for ${asset.symbol} (${asset.owner}): ${error.message}`);
						}
					}

					allMetrics.push({
						symbol: asset.symbol,
						quantity: asset.quantity,
						currentPrice: price,
						value: asset.quantity * price,
						currency: displayCurrency,
						exchange: asset.exchange,
						owner: asset.owner,
					});
				}
			}
		}

		return allMetrics;
	}

	public getStatus() {
		const status: Record<string, any> = {};

		for (const [exchangeName, exchange] of this.exchanges) {
			const assets = this.assetsByExchange.get(exchangeName) || [];
			status[exchangeName] = {
				assets: assets.map((a) => a.symbol),
				prices: exchange.getAllPrices().length,
				lastUpdate: new Date().toISOString(),
			};
		}

		return status;
	}

	public stopAll(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = undefined;
		}
		this.fiatService.stop();
		Logger.info("Stopped all monitoring");
	}
}
