import { BaseExchange } from "./base-exchange";
import type { PriceData } from "../types";

export class CryptoExchange extends BaseExchange {
	constructor() {
		super("Crypto");
	}

	async fetchPrices(symbols: string[]): Promise<PriceData[]> {
		const response = await fetch("https://forex.rabbitmonitor.com/v1/crypto/rates/USD", {
			signal: AbortSignal.timeout(5000),
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();

		return symbols
			.filter((symbol) => data.rates && data.rates[symbol])
			.map((symbol) => ({
				symbol,
				price: 1 / data.rates[symbol],
				currency: "USD",
				timestamp: Date.now(),
			}));
	}
}
