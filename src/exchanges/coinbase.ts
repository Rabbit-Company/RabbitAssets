import { Logger } from "../logger.js";
import { BaseExchange } from "./base-exchange.js";

export class CoinbaseExchange extends BaseExchange {
	protected name = "Coinbase";

	protected getWebSocketURL(symbols: string[]): string {
		return "wss://ws-feed.exchange.coinbase.com";
	}

	override async sendSubscriptionMessage(symbols: string[]): Promise<void> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket is not connected");
		}

		const subscriptionMessage = {
			type: "subscribe",
			product_ids: symbols.map((symbol) => `${symbol}-USD`),
			channels: ["ticker_batch"],
		};

		this.ws.send(JSON.stringify(subscriptionMessage));
		Logger.debug(`[${this.name}] Sent subscription for symbols: ${symbols.join(", ")}`);
	}

	protected handleMessage(data: any): void {
		if (data?.type !== "ticker") return;

		this.updatePrice({
			symbol: data?.product_id?.replace("-USD", ""),
			price: parseFloat(data?.price),
			currency: "USD",
			timestamp: Date.now(),
		});
	}
}
