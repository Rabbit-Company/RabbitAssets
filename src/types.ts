export interface ConfigType {
	server: {
		port: number;
		host: string;
	};
	logger: {
		level: number;
	};
	assets: AssetConfig[];
}

export interface ExchangeConfig {
	name: string;
	pollInterval: number;
}

export interface AssetConfig {
	symbol: string;
	quantity: number;
	exchange: string;
	currency: string;
}

export interface PriceData {
	symbol: string;
	price: number;
	timestamp: number;
	currency: string;
}

export interface AssetMetrics {
	symbol: string;
	quantity: number;
	currentPrice: number;
	value: number;
	currency: string;
}
