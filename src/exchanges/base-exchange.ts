import { EventEmitter } from "events";
import type { PriceData, ExchangeConfig } from "../types";

export abstract class BaseExchange extends EventEmitter {
	protected name: string;
	protected pollInterval: number;
	protected prices = new Map<string, PriceData>();
	protected ws: WebSocket | null = null;
	protected wsConnected: boolean = false;

	constructor(config: ExchangeConfig) {
		super();
		this.name = config.name;
		this.pollInterval = config.pollInterval;
	}

	// WebSocket methods - to be implemented by subclasses
	abstract connectWebSocket(symbols: string[], onPriceUpdate?: (data: PriceData) => void): Promise<void>;
	abstract disconnectWebSocket(): void;
	protected abstract handleWebSocketMessage(data: any): void;

	// REST methods - can be overridden by subclasses
	async fetchPricesRest(symbols: string[]): Promise<PriceData[]> {
		// Base implementation returns empty array
		return [];
	}

	// Price management
	protected updatePrice(symbol: string, price: number, currency: string = "USD"): void {
		const priceData: PriceData = {
			symbol,
			price,
			timestamp: Date.now(),
			currency,
		};
		this.prices.set(symbol, priceData);
		this.emit("priceUpdate", priceData);
	}

	public getPrice(symbol: string): PriceData | undefined {
		return this.prices.get(symbol);
	}

	public getAllPrices(): PriceData[] {
		return Array.from(this.prices.values());
	}

	public isWebSocketConnected(): boolean {
		return this.wsConnected;
	}

	public getName(): string {
		return this.name;
	}
}
