import { Logger } from "../logger";

interface FiatRates {
	[currency: string]: number; // USD to target currency rate
}

export class FiatService {
	private rates: FiatRates = {};
	private lastUpdate: Date | null = null;
	private updateInterval: number = 30; // 30 seconds
	private intervalId: NodeJS.Timeout | null = null;

	constructor() {
		// Base rate for USD
		this.rates.USD = 1;
	}

	async initialize(): Promise<void> {
		await this.updateRates();
		this.startPeriodicUpdate();
	}

	async updateRates(): Promise<void> {
		try {
			const response = await fetch("https://forex.rabbitmonitor.com/v1/rates/USD");
			const data = await response.json();

			Object.keys(data.rates).forEach((currency) => {
				this.rates[currency] = data.rates[currency];
			});

			this.lastUpdate = new Date();
			Logger.debug(`Fiat and metal rates updated: ${Object.keys(this.rates).join(", ")}`);
		} catch (err: any) {
			Logger.error("Failed to update fiat and metal rates:", err);
		}
	}

	startPeriodicUpdate(): void {
		this.intervalId = setInterval(() => {
			this.updateRates();
		}, this.updateInterval * 1000);
	}

	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	convert(amount: number, fromCurrency: string, toCurrency: string): number {
		// Convert through USD as base
		if (fromCurrency === toCurrency) return amount;

		if (fromCurrency !== "USD") {
			// Convert to USD first
			const usdRate = this.rates[fromCurrency];
			if (!usdRate) throw new Error(`Unknown currency: ${fromCurrency}`);
			amount = amount / usdRate;
		}

		if (toCurrency !== "USD") {
			// Convert from USD to target
			const targetRate = this.rates[toCurrency];
			if (!targetRate) throw new Error(`Unknown currency: ${toCurrency}`);
			amount = amount * targetRate;
		}

		return amount;
	}

	getRate(fromCurrency: string, toCurrency: string): number {
		if (fromCurrency === toCurrency) return 1;
		return this.convert(1, fromCurrency, toCurrency);
	}

	getSupportedCurrencies(): string[] {
		return Object.keys(this.rates);
	}

	getLastUpdate(): Date | null {
		return this.lastUpdate;
	}
}
