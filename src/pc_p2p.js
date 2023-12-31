Object.defineProperty(exports, '__esModule', { value: true });
const swarm = require('discovery-swarm');
const defaults = require('dat-swarm-defaults');
const blockchain_1 = require('./blockchain');
const transactionPool_1 = require('./transactionPool');
const _ = require("lodash");
const p2p = require('./p2p');
const crypto = require("crypto");
const getPort = require("get-port");

let connSeq = 0;
const peers = {};
let MessageType;
let userDetails;
let sw;

(function (MessageType) {
  MessageType[(MessageType.QUERY_LATEST = 0)] = 'QUERY_LATEST';
  MessageType[(MessageType.QUERY_ALL = 1)] = 'QUERY_ALL';
  MessageType[(MessageType.RESPONSE_BLOCKCHAIN = 2)] = 'RESPONSE_BLOCKCHAIN';
  MessageType[(MessageType.QUERY_TRANSACTION_POOL = 3)] = 'QUERY_TRANSACTION_POOL';
  MessageType[(MessageType.RESPONSE_TRANSACTION_POOL = 4)] = 'RESPONSE_TRANSACTION_POOL';
  MessageType[(MessageType.interNetworkTransaction = 5)] = 'interNetworkTransaction';
}(MessageType || (MessageType = {})));
class Message {}
const init_PC_P2PServer = (p2pPort) => {
  const userId = crypto.randomBytes(16).toString("hex");
  const config = defaults({
    id: userId,
    utp: true,
  });
  sw = swarm(config);
  console.log(`User ID: ${userId}`);
  sw.listen(p2pPort);
  console.log('Joining channel: powerchain');
  sw.join('powerchain');

  sw.on("connection", (conn, info) => {
    const seq = connSeq;
    const peerId = info.id.toString('hex');
    console.log(`Connected #${seq} to peer: ${info.id}`);
    initConnection(seq, peerId, conn);
  });
  console.log(`listening websocket p2p port on: ${p2pPort}`);
};
exports.init_PC_P2PServer = init_PC_P2PServer;

exports.exitPC_P2P = () => {
  sw.leave('powerchain');
}
const initConnection = (seq, peerId, conn) => {
  if (!peers[peerId]) {
    peers[peerId] = {};
  }
  peers[peerId].conn = conn;
  peers[peerId].seq = seq;
  connSeq++;
  initMessageHandler(conn);
  initErrorHandler(conn, peerId, seq);
  write(conn, queryConn());
};

const JSONToObject = (data) => {
  try {
    return JSON.parse(data);
  } catch (e) {
    console.log(`ERRRRRRRRRRRRR  :${e}`);
    return null;
  }
};

const initMessageHandler = (conn) => {
  conn.on('data', (data) => {
    try {
      const message = JSONToObject(data);
      if (message === null) {
        console.log(`could not parse received JSON message: ${data}`);
        return;
      }
      console.log('Received message: %s', JSON.stringify(message));
      switch (message.type) {
        case 5:
              console.log('inter');
              if(message.tx.channel === userDetails.channelName) {
                console.log("Same channel transaction request, adding it to pool\n");
                const transaction = message.tx;
                const powerRatio = transaction.powerRatio;
                let txOuts = transaction.txOuts;
                txOuts = txOuts.map(txOut => ({ ...txOut, amount: txOut.amount*powerRatio }));
                transaction.txOuts = txOuts;
                transactionPool_1.insertTxIntoTxPool(message.tx);
              }
              break;
      }
    } catch (e) {
      console.log(e);
    }
  });
};
const write = (conn, message) => conn.write(JSON.stringify(message));
const broadcast = (message) => {
  console.log(Object.keys(peers));
  for (const id in peers) {
      write(peers[id].conn, message);
  }
};

const sendInterNetworktx = (data) => {
  console.log('InterNetwork');
  const msgData = {
    type: MessageType.interNetworkTransaction,
    tx: data
  }
  broadcast(msgData);
}
exports.sendInterNetworktx = sendInterNetworktx;
const queryConn = () => ({
  type: MessageType.QUERY_LATEST,
  data: null,
});

const initErrorHandler = (conn, peerId, seq) => {
  conn.on('close', () => {
    if (peers[peerId].seq === seq) {
      console.log(`peer exited: ${JSON.stringify(peers[peerId].seq)}`);
      delete peers[peerId];
      console.log(peers);
    }
  });
};

exports.init = async (userInfo) => {
  userDetails = userInfo;
  const portForPc = await getPort();
  init_PC_P2PServer(portForPc);
}
