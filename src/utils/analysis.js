// Analysis utility for processing transactions and building the graph

export function getDecimals(tokenAddress) {
  // Tron USDT and TRX typically use 6 decimals
  return 6;
}

export function formatValue(valueRaw, token) {
  const decimals = getDecimals(token);
  try {
    const val = parseFloat(valueRaw);
    if (isNaN(val)) return 0;
    return val / Math.pow(10, decimals);
  } catch (e) {
    return 0;
  }
}

export function buildGraphAndMetrics(txs, queriedAddresses) {
  if (!txs || txs.length === 0) {
    return {
      nodes: [],
      links: [],
      metrics: {
        totalSent: 0,
        totalReceived: 0,
        netFlow: 0,
        txCount: 0,
        maxSentTx: null,
        maxReceivedTx: null,
        mostFrequentCounterparty: null,
        largestVolumeCounterparty: null,
        tokenSummary: {}
      }
    };
  }

  const nodesDict = {};
  const linksDict = {};
  
  // Stats tracking for each queried address (or overall if multiple)
  let totalSent = 0;
  let totalReceived = 0;
  let maxSentTx = null;
  let maxReceivedTx = null;
  
  const counterparties = {};
  const tokenSummary = {};

  // Convert queried addresses set
  const queriedSet = new Set(queriedAddresses.map(a => a.toLowerCase()));

  // Categorize address
  function getNodeType(addr, alias, isContract) {
    const addrLower = addr.toLowerCase();
    if (queriedSet.has(addrLower)) {
      return "target";
    }
    const aliasLower = (alias || "").toLowerCase();
    if (aliasLower.includes("binance") || aliasLower.includes("kraken") || aliasLower.includes("okx") || aliasLower.includes("exchange") || aliasLower.includes("coinbase")) {
      return "exchange";
    }
    if (aliasLower.includes("mixer") || aliasLower.includes("tornado") || aliasLower.includes("coinjoin")) {
      return "mixer";
    }
    if (aliasLower.includes("bridge") || aliasLower.includes("bridgers") || aliasLower.includes("stargate")) {
      return "bridge";
    }
    if (aliasLower.includes("scam") || aliasLower.includes("phishing") || aliasLower.includes("hacker") || aliasLower.includes("flagged")) {
      return "risk";
    }
    if (isContract === 1) {
      return "contract";
    }
    return "wallet";
  }

  // Iterate over transactions
  txs.forEach(tx => {
    const from = tx.from;
    const to = tx.to;
    if (!from || !to) return;

    const fromLower = from.toLowerCase();
    const toLower = to.toLowerCase();

    const token = tx.token || "USDT";
    const value = formatValue(tx.value, token);
    const time = tx.time || 0;
    const txid = tx.txid || "";
    const block = tx.block_no || tx.height || 0;

    const fromAlias = tx.fromAlias || "";
    const toAlias = tx.toAlias || "";

    // Track token summary
    if (!tokenSummary[token]) {
      tokenSummary[token] = { count: 0, volume: 0 };
    }
    tokenSummary[token].count++;
    tokenSummary[token].volume += value;

    // Add nodes to dictionary if not present
    if (!nodesDict[from]) {
      nodesDict[from] = {
        id: from,
        label: fromAlias || `${from.substring(0, 6)}...${from.substring(from.length - 4)}`,
        alias: fromAlias,
        type: getNodeType(from, fromAlias, 0),
        txCount: 0,
        totalSent: 0,
        totalReceived: 0,
        isQueried: queriedSet.has(fromLower)
      };
    }
    if (!nodesDict[to]) {
      nodesDict[to] = {
        id: to,
        label: toAlias || `${to.substring(0, 6)}...${to.substring(to.length - 4)}`,
        alias: toAlias,
        type: getNodeType(to, toAlias, tx.toIsContract),
        txCount: 0,
        totalSent: 0,
        totalReceived: 0,
        isQueried: queriedSet.has(toLower)
      };
    }

    // Update node balances & tx counts in context of this transaction list
    nodesDict[from].txCount++;
    nodesDict[from].totalSent += value;
    nodesDict[to].txCount++;
    nodesDict[to].totalReceived += value;

    // Create or update connection link
    const linkKey = `${from}->${to}`;
    if (!linksDict[linkKey]) {
      linksDict[linkKey] = {
        id: linkKey,
        source: from,
        target: to,
        value: 0,
        txCount: 0,
        token: token,
        txs: []
      };
    }
    linksDict[linkKey].value += value;
    linksDict[linkKey].txCount++;
    linksDict[linkKey].txs.push({
      txid,
      value,
      time,
      block
    });

    // Metric Calculations for the Main Investigated Scope
    const isFromTarget = queriedSet.has(fromLower);
    const isToTarget = queriedSet.has(toLower);

    if (isFromTarget) {
      totalSent += value;
      // Max single sent
      if (!maxSentTx || value > maxSentTx.value) {
        maxSentTx = { value, to, toAlias, time, txid, block };
      }

      // Track counterparty details
      if (!counterparties[to]) {
        counterparties[to] = { address: to, alias: toAlias, sentCount: 0, receivedCount: 0, sentVolume: 0, receivedVolume: 0 };
      }
      counterparties[to].sentCount++;
      counterparties[to].sentVolume += value;
    }

    if (isToTarget) {
      totalReceived += value;
      // Max single received
      if (!maxReceivedTx || value > maxReceivedTx.value) {
        maxReceivedTx = { value, from, fromAlias, time, txid, block };
      }

      // Track counterparty details
      if (!counterparties[from]) {
        counterparties[from] = { address: from, alias: fromAlias, sentCount: 0, receivedCount: 0, sentVolume: 0, receivedVolume: 0 };
      }
      counterparties[from].receivedCount++;
      counterparties[from].receivedVolume += value;
    }
  });

  // Find most frequent and largest volume counterparties
  let mostFrequentCounterparty = null;
  let largestVolumeCounterparty = null;
  let maxFreq = 0;
  let maxVol = 0;

  Object.values(counterparties).forEach(cp => {
    const totalCount = cp.sentCount + cp.receivedCount;
    const totalVol = cp.sentVolume + cp.receivedVolume;

    if (totalCount > maxFreq) {
      maxFreq = totalCount;
      mostFrequentCounterparty = {
        address: cp.address,
        alias: cp.alias,
        totalCount,
        sentCount: cp.sentCount,
        receivedCount: cp.receivedCount,
        volume: totalVol
      };
    }

    if (totalVol > maxVol) {
      maxVol = totalVol;
      largestVolumeCounterparty = {
        address: cp.address,
        alias: cp.alias,
        volume: totalVol,
        txCount: totalCount,
        sentVolume: cp.sentVolume,
        receivedVolume: cp.receivedVolume
      };
    }
  });

  // Convert nodes dictionary to array and scale node size
  const nodes = Object.values(nodesDict);
  const maxNodeVol = Math.max(...nodes.map(n => n.totalSent + n.totalReceived), 1.0);
  
  nodes.forEach(node => {
    const vol = node.totalSent + node.totalReceived;
    if (node.isQueried) {
      node.valSize = 50; // Main investigation nodes are large
    } else {
      // Scale other nodes between 20 and 42
      node.valSize = 22 + Math.min(20, Math.floor(20 * (vol / maxNodeVol)));
    }
  });

  const links = Object.values(linksDict);

  // Group timeline data for charts (by date)
  const timelineData = {};
  txs.forEach(tx => {
    const token = tx.token || "USDT";
    const value = formatValue(tx.value, token);
    const timeStamp = tx.time || 0;
    if (!timeStamp) return;

    const date = new Date(timeStamp * 1000);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!timelineData[dateStr]) {
      timelineData[dateStr] = { date: dateStr, sent: 0, received: 0, count: 0 };
    }

    timelineData[dateStr].count++;
    
    const fromLower = tx.from.toLowerCase();
    const toLower = tx.to.toLowerCase();
    
    if (queriedSet.has(fromLower)) {
      timelineData[dateStr].sent += value;
    }
    if (queriedSet.has(toLower)) {
      timelineData[dateStr].received += value;
    }
  });

  const timeline = Object.values(timelineData).sort((a, b) => a.date.localeCompare(b.date));

  return {
    nodes,
    links,
    metrics: {
      totalSent,
      totalReceived,
      netFlow: totalReceived - totalSent,
      txCount: txs.length,
      maxSentTx,
      maxReceivedTx,
      mostFrequentCounterparty,
      largestVolumeCounterparty,
      tokenSummary
    },
    timeline
  };
}
