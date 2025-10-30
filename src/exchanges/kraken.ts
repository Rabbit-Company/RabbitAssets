import { Logger } from "../logger.js";
import { BaseExchange } from "./base-exchange.js";

export class KrakenExchange extends BaseExchange {
	protected name = "Kraken";

	protected getWebSocketURL(symbols: string[]): string {
		return "wss://ws.kraken.com/v2";
	}

	override async sendSubscriptionMessage(symbols: string[]): Promise<void> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket is not connected");
		}

		const subscriptionMessage = {
			method: "subscribe",
			params: {
				channel: "ticker",
				symbol: symbols.map((symbol) => `${symbol}/USD`),
			},
		};

		this.ws.send(JSON.stringify(subscriptionMessage));
		Logger.debug(`[${this.name}] Sent subscription for symbols: ${symbols.join(", ")}`);
	}

	protected handleMessage(data: any): void {
		if (data?.channel !== "ticker") return;
		if (!["snapshot", "update"].includes(data?.type)) return;
		if (!Array.isArray(data?.data)) return;

		data.data.forEach((crypto: any) => {
			const symbol = crypto?.symbol?.replace("/USD", "");
			const price = parseFloat(crypto?.last);

			this.updatePrice({
				symbol,
				price,
				currency: "USD",
				timestamp: Date.now(),
			});
		});
	}
}
