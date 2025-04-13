// index.js
const TelegramBot = require("node-telegram-bot-api");
const ccxt = require("ccxt");
const axios = require("axios");

// 从环境变量读取 Token 和 Chat ID
const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const bot = new TelegramBot(TOKEN, { polling: true });
const exchange = new ccxt.kucoinfutures({ enableRateLimit: true });

// 北京时间修正
function getBeijingTime(timestamp) {
  const date = new Date(timestamp);
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().replace("T", " ").split(".")[0];
}

async function fetchOHLCV(symbol, timeframe = "15m", limit = 96) {
  const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, { limit });
  return ohlcv.map(item => ({
    timestamp: getBeijingTime(item[0]),
    high: item[2],
    low: item[3],
  }));
}

function findValidPoints(data) {
  const highs = [], lows = [];

  data.forEach((item, i) => {
    const laterLows = data.slice(i + 1).map(x => x.low);
    const laterHighs = data.slice(i + 1).map(x => x.high);

    const isLow = !laterLows.some(low => low < item.low);
    const isHigh = !laterHighs.some(high => high > item.high);

    if (isLow) lows.push(item);
    if (isHigh) highs.push(item);
  });

  return { highs, lows };
}

async function analyze(symbol, label) {
  const rawData = await fetchOHLCV(symbol);
  const { highs, lows } = findValidPoints(rawData);
  const trend =
    highs.length > lows.length
      ? `❌ 下跌趋势 (${highs.length} 高点 > ${lows.length} 低点)`
      : highs.length < lows.length
      ? `✅ 上涨趋势 (${lows.length} 低点 > ${highs.length} 高点)`
      : `⚖️ 趋势不明 (${highs.length} = ${lows.length})`;

  const latestHigh = highs.at(-1) ? `${highs.at(-1).high} (${highs.at(-1).timestamp})` : "无";
  const latestLow = lows.at(-1) ? `${lows.at(-1).low} (${lows.at(-1).timestamp})` : "无";

  return `*${label}*\n趋势: ${trend}\n最新高点: ${latestHigh}\n最新低点: ${latestLow}`;
}

// 处理指令
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, "你好，我是你的趋势分析机器人！输入 /analysis 查看币种趋势。");
});

bot.onText(/\/analysis/, async msg => {
  try {
    const btc = await analyze("BTC/USDT:USDT", "BTC（15分钟）");
    const eth = await analyze("ETH/USDT:USDT", "ETH（15分钟）");

    await bot.sendMessage(msg.chat.id, `=== 趋势分析 ===\n\n${btc}\n\n${eth}\n\n=== 分析结束 ===`, {
      parse_mode: "Markdown",
    });
  } catch (err) {
    bot.sendMessage(msg.chat.id, `分析出错了：${err.message}`);
  }
});
