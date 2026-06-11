import os
import math
import time
import logging
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("flowlens-backend")

app = FastAPI(title="FlowLens Pathfinder API", version="1.0.0")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, restrict to frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_URL = "https://usdt.tokenview.io/api/usdt/addresstxlist"

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,en-IN;q=0.8",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0"
    ),
    "Cookie": "verified=1; lang=en; globle-lang=en"
}

# In-memory cache to prevent hitting rate limits repeatedly for the same address
cache_db: Dict[str, Dict[str, Any]] = {}

def get_decimals(token_address: str) -> int:
    # TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t is Tron USDT (6 decimals)
    # If it's TRX or USDT, it's 6 decimals
    return 6

def generate_mock_data(address: str) -> Dict[str, Any]:
    """Generates high-fidelity mock data representing a complex transaction tree for demonstration."""
    logger.info(f"Generating mock data for address: {address}")
    
    # We will generate a structured web of transactions centered around the queried address.
    # We want a mix of exchanges, mixers, and wallets.
    
    # 1. Main queried address
    main_addr = address
    alias_map = {
        main_addr: "Target Wallet (Investigated)",
        "TPwezUWpEGmFBENNWJHwXHRG1D2NCEEt5s": "Bridgers 1.1 (Bridge)",
        "TMooRJeaCZdtydrn4gTCeiMtQMeLs7wpnB": "Binance Deposit Wallet",
        "TY3T8gB...zU9s": "Tornado Cash Mixer (TRX)",
        "TExch...777": "Kraken Hot Wallet",
        "TWhale...111": "Whale Wallet",
        "TScam...999": "Phishing Contract (Flagged)",
        "TUser...001": "Counterparty A",
        "TUser...002": "Counterparty B",
        "TUser...003": "Counterparty C",
    }
    
    # Generate some realistic transactions
    txs = [
        # Incoming large transfer from a Whale Wallet
        {
            "type": "tx",
            "network": "TRX",
            "block_no": 83497200,
            "height": 83497200,
            "index": 12,
            "time": int(time.time()) - 86400 * 3,  # 3 days ago
            "txid": "e4b3701a2f672c4c4e4f84271d77b7873582b82fa227b2f16760470c725aa111",
            "confirmations": 12000,
            "from": "TWhale...111",
            "fromAlias": "Whale Wallet",
            "to": main_addr,
            "toAlias": alias_map.get(main_addr),
            "value": "25000000000",  # 25,000 USDT
            "token": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
        },
        # Outgoing transfer to Bridgers Bridge
        {
            "type": "tx",
            "network": "TRX",
            "block_no": 83497202,
            "height": 83497202,
            "index": 92,
            "time": int(time.time()) - 86400 * 2,  # 2 days ago
            "txid": "6238461c2e672c4c4e4f84271d77b7873582b82fa227b2f16760470c725aa3cd",
            "confirmations": 8000,
            "from": main_addr,
            "fromAlias": alias_map.get(main_addr),
            "to": "TPwezUWpEGmFBENNWJHwXHRG1D2NCEEt5s",
            "toAlias": "Bridgers1.1",
            "value": "992278425",  # 992.27 USDT
            "token": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
        },
        # Incoming from a deposit wallet
        {
            "type": "tx",
            "network": "TRX",
            "block_no": 83497202,
            "height": 83497202,
            "index": 37,
            "time": int(time.time()) - 86400 * 2,
            "txid": "4f131ae71991943a7d9fb9f74ac92f9b40e19b4cbeeba6705a754a6ddf401307",
            "confirmations": 8000,
            "from": "TMooRJeaCZdtydrn4gTCeiMtQMeLs7wpnB",
            "fromAlias": "Binance Deposit Wallet",
            "to": main_addr,
            "toAlias": alias_map.get(main_addr),
            "value": "1496000000",  # 1,496 USDT
            "toIsContract": 0,
            "token": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
        },
        # Multiple rapid transfers to Mixer
        {
            "type": "tx",
            "network": "TRX",
            "block_no": 83497500,
            "height": 83497500,
            "index": 5,
            "time": int(time.time()) - 3600 * 12,  # 12 hours ago
            "txid": "90e3701a2f672c4c4e4f84271d77b7873582b82fa227b2f16760470c725aa222",
            "confirmations": 500,
            "from": main_addr,
            "fromAlias": alias_map.get(main_addr),
            "to": "TY3T8gB...zU9s",
            "toAlias": "Tornado Cash Mixer (TRX)",
            "value": "5000000000",  # 5,000 USDT
            "token": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
        },
        {
            "type": "tx",
            "network": "TRX",
            "block_no": 83497600,
            "height": 83497600,
            "index": 15,
            "time": int(time.time()) - 3600 * 11,  # 11 hours ago
            "txid": "90e3701a2f672c4c4e4f84271d77b7873582b82fa227b2f16760470c725aa333",
            "confirmations": 450,
            "from": main_addr,
            "fromAlias": alias_map.get(main_addr),
            "to": "TY3T8gB...zU9s",
            "toAlias": "Tornado Cash Mixer (TRX)",
            "value": "7500000000",  # 7,500 USDT
            "token": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
        },
        # Interaction with Scam/Phishing Contract
        {
            "type": "tx",
            "network": "TRX",
            "block_no": 83497800,
            "height": 83497800,
            "index": 44,
            "time": int(time.time()) - 3600 * 5,  # 5 hours ago
            "txid": "a4b3701a2f672c4c4e4f84271d77b7873582b82fa227b2f16760470c725aa444",
            "confirmations": 200,
            "from": main_addr,
            "fromAlias": alias_map.get(main_addr),
            "to": "TScam...999",
            "toAlias": "Phishing Contract (Flagged)",
            "value": "150000000",  # 150 USDT
            "token": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
        },
        # Frequent small transfers with Counterparty A
        {
            "type": "tx",
            "network": "TRX",
            "block_no": 83497000,
            "height": 83497000,
            "index": 1,
            "time": int(time.time()) - 86400 * 5,
            "txid": "f101...1",
            "confirmations": 25000,
            "from": "TUser...001",
            "to": main_addr,
            "value": "500000000",  # 500 USDT
            "token": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
        },
        {
            "type": "tx",
            "network": "TRX",
            "block_no": 83497100,
            "height": 83497100,
            "index": 2,
            "time": int(time.time()) - 86400 * 4,
            "txid": "f101...2",
            "confirmations": 20000,
            "from": "TUser...001",
            "to": main_addr,
            "value": "500000000",  # 500 USDT
            "token": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
        },
        {
            "type": "tx",
            "network": "TRX",
            "block_no": 83497300,
            "height": 83497300,
            "index": 3,
            "time": int(time.time()) - 86400 * 1,
            "txid": "f101...3",
            "confirmations": 4000,
            "from": main_addr,
            "to": "TUser...001",
            "value": "750000000",  # 750 USDT
            "token": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
        },
        # Direct transfers to Kraken Hot Wallet
        {
            "type": "tx",
            "network": "TRX",
            "block_no": 83497900,
            "height": 83497900,
            "index": 88,
            "time": int(time.time()) - 3600 * 1,  # 1 hour ago
            "txid": "c4b3701a2f672c4c4e4f84271d77b7873582b82fa227b2f16760470c725aa555",
            "confirmations": 50,
            "from": main_addr,
            "fromAlias": alias_map.get(main_addr),
            "to": "TExch...777",
            "toAlias": "Kraken Hot Wallet",
            "value": "10000000000",  # 10,000 USDT
            "token": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
        }
    ]

    return {
        "code": 1,
        "msg": "成功",
        "enMsg": "SUCCESS",
        "data": {
            "type": "address",
            "network": "TRX",
            "hash": main_addr,
            "addrAlias": alias_map.get(main_addr, "Demo Account"),
            "txCount": len(txs),
            "txs": txs
        },
        "is_mock": True
    }

def analyze_transactions(address: str, txs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Computes intelligence reports: max amount, max frequent address, paths, nodes, links."""
    logger.info(f"Analyzing {len(txs)} transactions for {address}")
    
    total_sent = 0.0
    total_received = 0.0
    tx_count = len(txs)
    
    # Store counterparty analytics
    # Structure: { address: { sent_count: 0, received_count: 0, sent_volume: 0.0, received_volume: 0.0, tx_times: [] } }
    counterparties: Dict[str, Dict[str, Any]] = {}
    
    max_sent_tx = None
    max_received_tx = None
    
    active_tokens = set()
    
    # Nodes in the graph
    # Start with the main address itself
    nodes_dict = {
        address: {
            "id": address,
            "label": "Target Wallet",
            "alias": "Investigated Address",
            "type": "target",
            "txCount": 0,
            "totalSent": 0.0,
            "totalReceived": 0.0,
            "valSize": 50  # Size in visualization
        }
    }
    
    # We will accumulate link values
    # Key: f"{source}->{target}"
    links_dict: Dict[str, Dict[str, Any]] = {}
    
    for tx in txs:
        tx_from = tx.get("from")
        tx_to = tx.get("to")
        if not tx_from or not tx_to:
            continue
            
        token = tx.get("token", "TRX")
        active_tokens.add(token)
        
        # Parse value
        decimals = get_decimals(token)
        try:
            val_raw = float(tx.get("value", 0))
            val = val_raw / (10 ** decimals)
        except ValueError:
            val = 0.0
            
        time_stamp = tx.get("time", 0)
        txid = tx.get("txid", "")
        
        # Populate alias mapping
        from_alias = tx.get("fromAlias", "")
        to_alias = tx.get("toAlias", "")
        
        # Categorize node types based on alias names
        def get_node_type(addr: str, alias: str) -> str:
            if addr == address:
                return "target"
            alias_lower = alias.lower()
            if "binance" in alias_lower or "kraken" in alias_lower or "exchange" in alias_lower:
                return "exchange"
            if "mixer" in alias_lower or "tornado" in alias_lower:
                return "mixer"
            if "bridge" in alias_lower or "bridgers" in alias_lower:
                return "bridge"
            if "scam" in alias_lower or "phishing" in alias_lower or "flagged" in alias_lower:
                return "risk"
            if tx.get("toIsContract") == 1 and addr == tx_to:
                return "contract"
            return "wallet"
            
        # Initialize node in graph
        for addr, alias in [(tx_from, from_alias), (tx_to, to_alias)]:
            if addr not in nodes_dict:
                node_type = get_node_type(addr, alias)
                nodes_dict[addr] = {
                    "id": addr,
                    "label": alias if alias else f"{addr[:6]}...{addr[-4:]}" if len(addr) > 10 else addr,
                    "alias": alias,
                    "type": node_type,
                    "txCount": 0,
                    "totalSent": 0.0,
                    "totalReceived": 0.0,
                    "valSize": 30
                }
        
        # Update connection counts & volumes
        nodes_dict[tx_from]["txCount"] += 1
        nodes_dict[tx_from]["totalSent"] += val
        nodes_dict[tx_to]["txCount"] += 1
        nodes_dict[tx_to]["totalReceived"] += val
        
        # Build Link
        link_key = f"{tx_from}->{tx_to}"
        if link_key not in links_dict:
            links_dict[link_key] = {
                "id": link_key,
                "source": tx_from,
                "target": tx_to,
                "value": 0.0,
                "txCount": 0,
                "lastTxTime": 0,
                "txs": []
            }
        
        links_dict[link_key]["value"] += val
        links_dict[link_key]["txCount"] += 1
        links_dict[link_key]["lastTxTime"] = max(links_dict[link_key]["lastTxTime"], time_stamp)
        links_dict[link_key]["txs"].append({
            "txid": txid,
            "value": val,
            "time": time_stamp,
            "block": tx.get("block_no", 0)
        })
        
        # Core address analysis
        if tx_from == address:
            total_sent += val
            # Max Sent Tx
            if not max_sent_tx or val > max_sent_tx["value"]:
                max_sent_tx = {
                    "value": val,
                    "to": tx_to,
                    "toAlias": to_alias,
                    "time": time_stamp,
                    "txid": txid,
                    "block": tx.get("block_no", 0)
                }
            
            # Counterparty tracking
            if tx_to not in counterparties:
                counterparties[tx_to] = {"sent_count": 0, "received_count": 0, "sent_volume": 0.0, "received_volume": 0.0, "times": []}
            counterparties[tx_to]["sent_count"] += 1
            counterparties[tx_to]["sent_volume"] += val
            counterparties[tx_to]["times"].append(time_stamp)
            
        if tx_to == address:
            total_received += val
            # Max Received Tx
            if not max_received_tx or val > max_received_tx["value"]:
                max_received_tx = {
                    "value": val,
                    "from": tx_from,
                    "fromAlias": from_alias,
                    "time": time_stamp,
                    "txid": txid,
                    "block": tx.get("block_no", 0)
                }
                
            # Counterparty tracking
            if tx_from not in counterparties:
                counterparties[tx_from] = {"sent_count": 0, "received_count": 0, "sent_volume": 0.0, "received_volume": 0.0, "times": []}
            counterparties[tx_from]["received_count"] += 1
            counterparties[tx_from]["received_volume"] += val
            counterparties[tx_from]["times"].append(time_stamp)

    # Find most frequent counterparty
    most_frequent_address = None
    max_frequency = 0
    frequent_volume = 0.0
    frequent_details = {}
    
    # Find largest volume counterparty
    largest_volume_address = None
    max_volume = 0.0
    volume_details = {}

    for cp_addr, data in counterparties.items():
        total_tx_count = data["sent_count"] + data["received_count"]
        total_tx_volume = data["sent_volume"] + data["received_volume"]
        
        if total_tx_count > max_frequency:
            max_frequency = total_tx_count
            most_frequent_address = cp_addr
            frequent_volume = total_tx_volume
            frequent_details = {
                "sent_count": data["sent_count"],
                "received_count": data["received_count"],
                "total_count": total_tx_count,
                "volume": total_tx_volume,
                "alias": nodes_dict.get(cp_addr, {}).get("alias", "")
            }
            
        if total_tx_volume > max_volume:
            max_volume = total_tx_volume
            largest_volume_address = cp_addr
            volume_details = {
                "sent_volume": data["sent_volume"],
                "received_volume": data["received_volume"],
                "total_volume": total_tx_volume,
                "tx_count": total_tx_count,
                "alias": nodes_dict.get(cp_addr, {}).get("alias", "")
            }

    # Format nodes list and scale node sizes based on transaction volume relative to total
    nodes = []
    max_node_vol = max([n["totalSent"] + n["totalReceived"] for n in nodes_dict.values()] or [1.0])
    
    for nid, node in nodes_dict.items():
        vol = node["totalSent"] + node["totalReceived"]
        # Scale sizes between 20 and 60
        if nid == address:
            node["valSize"] = 55
        else:
            node["valSize"] = 25 + int(35 * (vol / max_node_vol))
        nodes.append(node)
        
    links = list(links_dict.values())
    
    # Sort txs by time descending for timeline
    sorted_txs = sorted(txs, key=lambda x: x.get("time", 0), reverse=True)
    
    # Create time buckets for chart: e.g. daily volumes
    timeline_data = {}
    for tx in sorted_txs:
        t = tx.get("time", 0)
        # Format as YYYY-MM-DD
        date_str = time.strftime('%Y-%m-%d', time.localtime(t))
        val = float(tx.get("value", 0)) / (10 ** get_decimals(tx.get("token", "")))
        
        if date_str not in timeline_data:
            timeline_data[date_str] = {"date": date_str, "sent": 0.0, "received": 0.0, "count": 0}
            
        timeline_data[date_str]["count"] += 1
        if tx.get("from") == address:
            timeline_data[date_str]["sent"] += val
        if tx.get("to") == address:
            timeline_data[date_str]["received"] += val
            
    timeline = sorted(list(timeline_data.values()), key=lambda x: x["date"])

    analysis = {
        "address": address,
        "alias": nodes_dict.get(address, {}).get("alias", "Target Account"),
        "total_sent": total_sent,
        "total_received": total_received,
        "net_flow": total_received - total_sent,
        "tx_count": tx_count,
        "active_tokens": list(active_tokens),
        "max_sent": max_sent_tx,
        "max_received": max_received_tx,
        "most_frequent_counterparty": {
            "address": most_frequent_address,
            **frequent_details
        } if most_frequent_address else None,
        "largest_volume_counterparty": {
            "address": largest_volume_address,
            **volume_details
        } if largest_volume_address else None,
        "timeline": timeline
    }

    return {
        "analysis": analysis,
        "graph": {
            "nodes": nodes,
            "links": links
        }
    }

@app.get("/api/demo-addresses")
def get_demo_addresses():
    return [
        {
            "address": "TPwezUWpEGmFBENNWJHwXHRG1D2NCEEt5s",
            "name": "Bridgers1.1 (TRX Bridge)",
            "description": "High-frequency bridge address processing hundreds of transactions. Excellent for displaying complex fan-out visual patterns.",
            "type": "bridge"
        },
        {
            "address": "TMooRJeaCZdtydrn4gTCeiMtQMeLs7wpnB",
            "name": "Binance Deposit Wallet",
            "description": "High-volume wallet that channels USDT to major exchange deposit contracts.",
            "type": "exchange"
        },
        {
            "address": "TWhaleUSDTActiveAddress1010101010",
            "name": "OTC Whale Trader",
            "description": "A high net worth private wallet interacting with various decentralized services, bridges, and exchange desks.",
            "type": "whale"
        },
        {
            "address": "TY3T8gB...zU9s",
            "name": "Tornado Cash Splitter Flow",
            "description": "Demonstrates privacy mixer inputs, asset branching, and rapid multi-path forwarding.",
            "type": "mixer"
        }
    ]

@app.get("/api/txs")
def get_transactions(
    address: str = Query(..., description="Web3 address to query"),
    limit: int = Query(50, description="Transactions per page", ge=1, le=50),
    max_pages: int = Query(5, description="Maximum number of pages to fetch", ge=1, le=50)
):
    address = address.strip()
    if not address:
        raise HTTPException(status_code=400, detail="Address parameter cannot be empty")
        
    logger.info(f"API request for address={address}, limit={limit}, max_pages={max_pages}")
    
    # Check cache first
    cache_key = f"{address}_{limit}_{max_pages}"
    if cache_key in cache_db:
        logger.info(f"Serving cached data for {cache_key}")
        return cache_db[cache_key]
        
    # Standard fallback mock if address matches our demo accounts or is offline
    is_demo = address in [
        "TPwezUWpEGmFBENNWJHwXHRG1D2NCEEt5s", 
        "TMooRJeaCZdtydrn4gTCeiMtQMeLs7wpnB", 
        "TWhaleUSDTActiveAddress1010101010",
        "TY3T8gB...zU9s"
    ] or address.startswith("DEMO_")
    
    if is_demo:
        mock_response = generate_mock_data(address)
        txs = mock_response["data"]["txs"]
        analysis_res = analyze_transactions(address, txs)
        analysis_res["is_mock"] = True
        cache_db[cache_key] = analysis_res
        return analysis_res

    # Live API Fetching
    session = requests.Session()
    headers = HEADERS.copy()
    headers["Referer"] = f"https://usdt.tokenview.io/en/address/{address}"
    
    url = f"{BASE_URL}/{address}/1/{limit}"
    
    try:
        r = session.get(url, headers=headers, timeout=15)
        
        # If Tokenview blocks or returns non-200, fallback to mock data to keep dashboard functional
        if r.status_code != 200:
            logger.warning(f"Tokenview API returned {r.status_code}. Falling back to simulated graph.")
            mock_response = generate_mock_data(address)
            txs = mock_response["data"]["txs"]
            analysis_res = analyze_transactions(address, txs)
            analysis_res["is_mock"] = True
            analysis_res["warning"] = f"Live API returned HTTP {r.status_code}. Displaying simulated network analysis."
            cache_db[cache_key] = analysis_res
            return analysis_res
            
        resp_json = r.json()
        if not resp_json or resp_json.get("code") != 1 or "data" not in resp_json or not resp_json["data"]:
            msg = resp_json.get("enMsg") or resp_json.get("msg") or "Invalid API response code"
            logger.warning(f"Tokenview API returned error: {msg}. Falling back to simulated graph.")
            mock_response = generate_mock_data(address)
            txs = mock_response["data"]["txs"]
            analysis_res = analyze_transactions(address, txs)
            analysis_res["is_mock"] = True
            analysis_res["warning"] = f"API Message: {msg}. Displaying simulated network analysis."
            cache_db[cache_key] = analysis_res
            return analysis_res
            
        data = resp_json["data"]
        tx_count = data.get("txCount", 0)
        txs = data.get("txs", [])
        
        # Calculate pagination limits
        total_pages = min(math.ceil(tx_count / limit), max_pages)
        logger.info(f"Total Transactions on-chain: {tx_count}. Fetching up to {total_pages} pages.")
        
        # Fetch remaining pages
        for page in range(2, total_pages + 1):
            page_url = f"{BASE_URL}/{address}/{page}/{limit}"
            try:
                page_r = session.get(page_url, headers=headers, timeout=15)
                if page_r.status_code == 200:
                    page_data = page_r.json().get("data", {})
                    page_txs = page_data.get("txs", [])
                    txs.extend(page_txs)
                    if len(page_txs) < limit:
                        break
                    time.sleep(0.1)  # small throttle
                else:
                    logger.warning(f"Failed to fetch page {page}: {page_r.status_code}")
                    break
            except Exception as e:
                logger.error(f"Error fetching page {page}: {e}")
                break
                
        # If no transactions were returned, generate mock transactions so there is a graph to show
        if not txs:
            logger.warning("No transactions returned by live API. Falling back to simulated graph.")
            mock_response = generate_mock_data(address)
            txs = mock_response["data"]["txs"]
            analysis_res = analyze_transactions(address, txs)
            analysis_res["is_mock"] = True
            analysis_res["warning"] = "No on-chain transactions found for this address. Displaying simulated network."
            cache_db[cache_key] = analysis_res
            return analysis_res

        # Analyze and build graph
        analysis_res = analyze_transactions(address, txs)
        analysis_res["is_mock"] = False
        cache_db[cache_key] = analysis_res
        return analysis_res
        
    except Exception as e:
        logger.error(f"Request failed: {e}. Falling back to simulated graph.")
        mock_response = generate_mock_data(address)
        txs = mock_response["data"]["txs"]
        analysis_res = analyze_transactions(address, txs)
        analysis_res["is_mock"] = True
        analysis_res["warning"] = f"Network connection error: {str(e)}. Displaying simulated network analysis."
        cache_db[cache_key] = analysis_res
        return analysis_res

if __name__ == "__main__":
    import uvicorn
    # Get port from environment or default to 8000
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=True)
