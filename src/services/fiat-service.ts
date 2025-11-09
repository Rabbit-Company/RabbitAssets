import { Logger } from "../logger";

interface FiatRates {
	[currency: string]: number;
}

export class FiatService {
	private rates: FiatRates = {};
	private lastUpdate: Date | null = null;
	private updateInterval: number = 30000; // 30 seconds
	private intervalId: NodeJS.Timeout | null = null;

	constructor() {
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
			Logger.debug(`Fiat rates updated: ${Object.keys(this.rates).join(", ")}`);
		} catch (err: any) {
			Logger.error("Failed to update fiat rates:", err);
		}
	}

	startPeriodicUpdate(): void {
		this.intervalId = setInterval(() => {
			this.updateRates();
		}, this.updateInterval);
	}

	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	convert(amount: number, fromCurrency: string, toCurrency: string): number {
		if (fromCurrency === toCurrency) return amount;

		if (fromCurrency !== "USD") {
			const usdRate = this.rates[fromCurrency];
			if (!usdRate) throw new Error(`Unknown currency: ${fromCurrency}`);
			amount = amount * usdRate;
		}

		if (toCurrency !== "USD") {
			const targetRate = this.rates[toCurrency];
			if (!targetRate) throw new Error(`Unknown currency: ${toCurrency}`);
			amount = amount / targetRate;
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
