import { BaseExchange } from "./base-exchange";
import type { PriceData } from "../types";
import { Logger } from "../logger";

interface BinanceTickerMessage {
	e: string; // Event type
	s: string; // Symbol
	c: string; // Current price
}

export class BinanceExchange extends BaseExchange {
	private wsBaseUrl = "wss://stream.binance.com:9443/ws";
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private onPriceUpdate?: (data: PriceData) => void;

	constructor() {
		super({ name: "binance", pollInterval: 30000 });
	}

	async connectWebSocket(symbols: string[], onPriceUpdate?: (data: PriceData) => void): Promise<void> {
		this.onPriceUpdate = onPriceUpdate;

		// Convert symbols to Binance format (lowercase with USDT pair)
		const streamNames = symbols.map((symbol) => `${symbol.toLowerCase()}usdt@ticker`);
		const streamUrl = `${this.wsBaseUrl}/${streamNames.join("/")}`;

		return new Promise((resolve, reject) => {
			try {
				if (typeof WebSocket === "undefined") {
					throw new Error("WebSocket not available in this environment");
				}

				this.ws = new WebSocket(streamUrl);

				this.ws.onopen = () => {
					Logger.info(`[Binance] WebSocket connected for: ${symbols.join(", ")}`);
					this.wsConnected = true;
					this.reconnectAttempts = 0;
					resolve();
				};

				this.ws.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data);
						this.handleWebSocketMessage(data);
					} catch (error: any) {
						Logger.error("[Binance] Error parsing WebSocket message:", error);
					}
				};

				this.ws.onclose = () => {
					Logger.info("[Binance] WebSocket disconnected");
					this.wsConnected = false;
					this.handleReconnection(symbols);
				};

				this.ws.onerror = (error) => {
					Logger.error("[Binance] WebSocket error:", error);
					reject(error);
				};
			} catch (error) {
				reject(error);
			}
		});
	}

	disconnectWebSocket(): void {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
			this.wsConnected = false;
		}
	}

	protected handleWebSocketMessage(data: any): void {
		if (data.e === "24hrTicker") {
			const tickerData = data as BinanceTickerMessage;
			const symbol = tickerData.s; // BTCUSDT, ETHUSDT, etc.
			const price = parseFloat(tickerData.c);

			// Extract base currency (BTC, ETH) by removing USDT
			const baseSymbol = symbol.replace("USDT", "");
			const currency = "USDT";

			this.updatePrice(baseSymbol, price, currency);
		}
	}

	private handleReconnection(symbols: string[]): void {
		if (this.reconnectAttempts < this.maxReconnectAttempts) {
			this.reconnectAttempts++;
			Logger.info(`[Binance] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

			setTimeout(() => {
				this.connectWebSocket(symbols, this.onPriceUpdate).catch((error) => {
					Logger.error("[Binance] Reconnection failed:", error);
				});
			}, 1000 * this.reconnectAttempts); // Exponential backoff
		} else {
			Logger.error("[Binance] Max reconnection attempts reached");
		}
	}

	override async fetchPricesRest(symbols: string[]): Promise<PriceData[]> {
		throw new Error("Binance exchange uses WebSocket only for real-time data");
	}
}
