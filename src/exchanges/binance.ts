import { BaseExchange } from "./base-exchange.js";

export class BinanceExchange extends BaseExchange {
	protected name = "Binance";

	protected getWebSocketURL(symbols: string[]): string {
		const streams = symbols.map((s) => `${s.toLowerCase()}usdt@ticker`).join("/");
		return `wss://stream.binance.com:9443/stream?streams=${streams}`;
	}

	protected handleMessage(data: any): void {
		if (!data?.data || data.data.e !== "24hrTicker") return;

		const ticker = data.data;
		const symbol = ticker.s.replace("USDT", "");
		const price = parseFloat(ticker.c);

		this.updatePrice({ symbol, price, currency: "USDT", timestamp: Date.now() });
	}
}
