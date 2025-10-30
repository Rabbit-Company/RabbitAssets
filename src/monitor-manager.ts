import { BinanceExchange } from "./exchanges/binance";
import { BaseExchange } from "./exchanges/base-exchange";
import type { AssetConfig, ConfigType, PriceData } from "./types";
import { Monitor } from "./monitor";
import { Logger } from "./logger";
import { KrakenExchange } from "./exchanges/kraken";
import { CoinbaseExchange } from "./exchanges/coinbase";
import { FiatService } from "./services/fiat-service";
import { FiatExchange } from "./exchanges/fiat";

interface ExchangeConstructor {
	new (): BaseExchange;
}

const EXCHANGE_REGISTRY: Record<string, ExchangeConstructor> = {
	fiat: FiatExchange,
	binance: BinanceExchange,
	kraken: KrakenExchange,
	coinbase: CoinbaseExchange,
	// coingecko: CoinGeckoExchange, // Add later
	// trading212: Trading212Exchange, // Add later
};

export class MonitorManager {
	private monitors = new Map<string, Monitor>();
	private assetMonitors = new Map<string, string>();
	private unsupportedAssets: AssetConfig[] = [];
	private fiatService: FiatService;

	constructor() {
		this.fiatService = new FiatService();
	}

	async initialize(config: ConfigType): Promise<void> {
		await this.fiatService.initialize();

		const assets = config.assets;

		// Group assets by exchange
		const assetsByExchange = new Map<string, AssetConfig[]>();

		for (const asset of assets) {
			if (!assetsByExchange.has(asset.exchange)) {
				assetsByExchange.set(asset.exchange, []);
			}
			assetsByExchange.get(asset.exchange)!.push(asset);
		}

		// Create monitors only for supported exchanges
		for (const [exchangeName, exchangeAssets] of assetsByExchange) {
			await this.createExchangeMonitor(exchangeName, exchangeAssets);
		}

		// Log any unsupported exchanges
		if (this.unsupportedAssets.length > 0) {
			const unsupportedExchanges = [...new Set(this.unsupportedAssets.map((a) => a.exchange))];
			Logger.warn(`Skipped ${this.unsupportedAssets.length} assets from unsupported exchanges: ${unsupportedExchanges.join(", ")}`);
			Logger.info(`Unsupported assets: ${this.unsupportedAssets.map((a) => a.symbol).join(", ")}`);
		}
	}

	private async createExchangeMonitor(exchangeName: string, assets: AssetConfig[]): Promise<void> {
		// Check if exchange is supported
		const ExchangeClass = EXCHANGE_REGISTRY[exchangeName];
		if (!ExchangeClass) {
			// Add to unsupported list and skip
			this.unsupportedAssets.push(...assets);
			Logger.warn(`Exchange '${exchangeName}' is not supported. Skipping assets: ${assets.map((a) => a.symbol).join(", ")}`);
			return;
		}

		let exchange: BaseExchange;

		try {
			exchange = new ExchangeClass();
		} catch (error: any) {
			Logger.error(`Failed to create exchange instance for ${exchangeName}:`, error);
			this.unsupportedAssets.push(...assets);
			return;
		}

		// Extract symbols and quantities
		const symbols = assets.map((a) => a.symbol);
		const assetsMap = assets.reduce((acc, asset) => {
			acc[asset.symbol] = asset.quantity;
			return acc;
		}, {} as Record<string, number>);

		// Determine if we should use WebSocket
		const useWebSocket = ["binance", "kraken", "coinbase"].includes(exchangeName); // Configure per exchange

		const monitor = new Monitor(exchange, 30000, assetsMap, useWebSocket, this.fiatService);

		// Store monitor and asset mappings
		this.monitors.set(exchangeName, monitor);
		assets.forEach((asset) => {
			this.assetMonitors.set(asset.symbol, exchangeName);
		});

		// Start monitoring
		try {
			await monitor.startMonitoring();
			Logger.info(`Started monitoring ${exchangeName} for: ${symbols.join(", ")}`);
		} catch (error: any) {
			Logger.error(`Failed to start monitoring for ${exchangeName}:`, error);
			// Remove failed monitor
			this.monitors.delete(exchangeName);
			assets.forEach((asset) => this.assetMonitors.delete(asset.symbol));
			this.unsupportedAssets.push(...assets);
		}
	}

	getAssetMetrics() {
		const allMetrics = [];

		for (const monitor of this.monitors.values()) {
			allMetrics.push(...monitor.getAssetMetrics());
		}

		return allMetrics;
	}

	getUnsupportedAssets(): AssetConfig[] {
		return [...this.unsupportedAssets];
	}

	getSupportedExchanges(): string[] {
		return Array.from(this.monitors.keys());
	}

	getStatus() {
		const status: Record<string, any> = {};

		for (const [exchangeName, monitor] of this.monitors) {
			status[exchangeName] = {
				connected: monitor.isWebSocketConnected(),
				type: monitor.isWebSocketConnected() ? "WebSocket" : "REST",
				assets: Array.from(this.assetMonitors.entries())
					.filter(([_, ex]) => ex === exchangeName)
					.map(([symbol]) => symbol),
			};
		}

		return {
			supported: status,
			unsupported: {
				exchanges: [...new Set(this.unsupportedAssets.map((a) => a.exchange))],
				assetCount: this.unsupportedAssets.length,
				assets: this.unsupportedAssets.map((a) => a.symbol),
			},
		};
	}

	async stopAll() {
		for (const monitor of this.monitors.values()) {
			monitor.stopMonitoring();
		}
	}
}
