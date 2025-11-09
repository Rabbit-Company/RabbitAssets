import { EventEmitter } from "events";
import { Logger } from "../logger";
import type { PriceData } from "../types";

export abstract class BaseExchange extends EventEmitter {
	protected name: string;
	protected prices: Map<string, PriceData> = new Map();

	constructor(name: string) {
		super();
		this.name = name;
	}

	protected abstract fetchPrices(symbols: string[]): Promise<PriceData[]>;

	public async updatePrices(symbols: string[]): Promise<void> {
		if (symbols.length === 0) return;

		try {
			Logger.debug(`[${this.name}] Fetching prices for: ${symbols.join(", ")}`);
			const prices = await this.fetchPrices(symbols);

			prices.forEach((price) => {
				this.updatePrice(price);
				Logger.debug(`[${this.name}] Updated ${price.symbol}: ${price.price} ${price.currency}`);
			});
		} catch (error: any) {
			Logger.error(`[${this.name}] Failed to fetch prices:`, error);
		}
	}

	protected updatePrice(priceData: PriceData): void {
		this.prices.set(priceData.symbol, priceData);
		this.emit("priceUpdate", priceData);
	}

	public getPrice(symbol: string): PriceData | undefined {
		return this.prices.get(symbol);
	}

	public getAllPrices(): PriceData[] {
		return Array.from(this.prices.values());
	}

	public hasPrice(symbol: string): boolean {
		return this.prices.has(symbol);
	}
}
