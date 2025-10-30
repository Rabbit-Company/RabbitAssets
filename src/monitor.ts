import { Config } from "./config";
import type { BaseExchange } from "./exchanges/base-exchange";
import { Logger } from "./logger";
import type { FiatService } from "./services/fiat-service";
import type { AssetMetrics, PriceData } from "./types";

export class Monitor {
	protected exchange: BaseExchange;
	protected pollInterval: number;
	protected assets: Record<string, number>;
	protected useWebSocket: boolean;
	protected pollIntervalId: NodeJS.Timeout | null = null;
	protected fiatService: FiatService;
	protected onPriceUpdateCallback?: (data: PriceData) => void;

	constructor(exchange: BaseExchange, pollInterval: number, assets: Record<string, number>, useWebSocket: boolean = true, fiatService: FiatService) {
		this.exchange = exchange;
		this.pollInterval = pollInterval;
		this.assets = assets;
		this.useWebSocket = useWebSocket;
		this.fiatService = fiatService;

		// Listen for price updates from the exchange
		this.exchange.on("priceUpdate", this.handlePriceUpdate.bind(this));
	}

	public async startMonitoring(): Promise<void> {
		const symbols = Object.keys(this.assets);

		if (this.useWebSocket && this.exchange.connectWebSocket) {
			try {
				Logger.info(`[${this.exchange.constructor.name}] Starting WebSocket monitoring for: ${symbols.join(", ")}`);
				await this.exchange.connectWebSocket(symbols);
			} catch (error: any) {
				Logger.error(`[${this.exchange.constructor.name}] WebSocket failed, falling back to REST:`, error);
				this.startRestPolling();
			}
		} else {
			this.startRestPolling();
		}
	}

	private handlePriceUpdate(priceData: PriceData): void {
		Logger.debug(`[${this.exchange.constructor.name}] Price update: ${priceData.symbol} = ${priceData.price} ${priceData.currency}`);

		// Call external callback if provided
		if (this.onPriceUpdateCallback) {
			this.onPriceUpdateCallback(priceData);
		}
	}

	public setOnPriceUpdate(callback: (data: PriceData) => void): void {
		this.onPriceUpdateCallback = callback;
	}

	private startRestPolling(): void {
		Logger.info(`[${this.exchange.constructor.name}] Starting REST polling every ${this.pollInterval}ms`);

		// Initial fetch
		this.fetchPricesViaRest();

		// Set up interval
		this.pollIntervalId = setInterval(() => {
			this.fetchPricesViaRest();
		}, this.pollInterval);
	}

	private async fetchPricesViaRest(): Promise<void> {
		try {
			const symbols = Object.keys(this.assets);
			await this.exchange.fetchPricesRest(symbols, this.fiatService);
			Logger.debug(`[${this.exchange.constructor.name}] Prices updated`);
		} catch (error: any) {
			Logger.error(`[${this.exchange.constructor.name}] REST polling error:`, error);
		}
	}

	public stopMonitoring(): void {
		if (this.pollIntervalId) {
			clearInterval(this.pollIntervalId);
			this.pollIntervalId = null;
		}

		if (this.exchange.disconnectWebSocket) {
			this.exchange.disconnectWebSocket();
		}
	}

	public getPrice(symbol: string): PriceData | undefined {
		return this.exchange.getPrice(symbol);
	}

	public getAllPrices(): PriceData[] {
		return this.exchange.getAllPrices();
	}

	public getAssetMetrics(): AssetMetrics[] {
		const metrics: AssetMetrics[] = [];

		for (const [symbol, quantity] of Object.entries(this.assets)) {
			const priceData = this.exchange.getPrice(symbol);
			if (priceData && priceData.price > 0) {
				let price = priceData.price;
				let displayCurrency = Config.get("assets").find((a) => a.symbol === priceData.symbol)?.currency || priceData.currency;

				// Convert to desired currency if currencies differ
				if (priceData.currency !== displayCurrency) {
					try {
						price = this.fiatService.convert(price, priceData.currency, displayCurrency);
					} catch (error: any) {
						displayCurrency = priceData.currency;
						Logger.warn(`Currency conversion failed for ${symbol}: ${error.message}`);
					}
				}

				metrics.push({
					symbol,
					quantity,
					currentPrice: price,
					value: quantity * price,
					currency: displayCurrency,
				});
			}
		}

		return metrics;
	}

	public isWebSocketConnected(): boolean {
		return this.exchange.isWebSocketConnected();
	}
}
