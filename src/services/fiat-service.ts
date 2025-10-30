import { XMLParser } from "fast-xml-parser";
import { Logger } from "../logger";

interface FiatRates {
	[currency: string]: number; // EUR to target currency rate
}

export class FiatService {
	private rates: FiatRates = {};
	private lastUpdate: Date | null = null;
	private updateInterval: number = 3600000; // 1 hour
	private intervalId: NodeJS.Timeout | null = null;

	constructor() {
		// Base rate for EUR
		this.rates.EUR = 1;
	}

	async initialize(): Promise<void> {
		await this.updateRates();
		this.startPeriodicUpdate();
	}

	async updateRates(): Promise<void> {
		try {
			const response = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml");
			const text = await response.text();

			const parser = new XMLParser({ ignoreAttributes: false });
			const obj = parser.parse(text);

			const fiats = obj?.["gesmes:Envelope"]?.Cube?.Cube?.Cube || [];

			fiats.forEach((fiat: any) => {
				const currency = fiat["@_currency"];
				const rate = parseFloat(fiat["@_rate"]);
				this.rates[currency] = rate;
			});

			this.lastUpdate = new Date();
			Logger.info(`Fiat rates updated: ${Object.keys(this.rates).join(", ")}`);
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
		// Convert through EUR as base
		if (fromCurrency === toCurrency) return amount;

		if (fromCurrency !== "EUR") {
			// Convert to EUR first
			const eurRate = this.rates[fromCurrency];
			if (!eurRate) throw new Error(`Unknown currency: ${fromCurrency}`);
			amount = amount / eurRate;
		}

		if (toCurrency !== "EUR") {
			// Convert from EUR to target
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
