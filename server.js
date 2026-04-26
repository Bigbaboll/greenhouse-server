const express = require('express');
app = express();

app.use(express.json());

// ==================== 跨域支持 ====================
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ==================== 全局数据存储 ====================

// 最新数据
let latestData = {
  nodeA: {
    temp: 0,
    humidity: 0,
    light: 0,
    timestamp: null,
    status: 'offline'
  },
  nodeB: {
    temp: 0,
    humidity: 0,
    light: 0,
    timestamp: null,
    status: 'offline'
  }
};

// 历史数据（保留最近100条）
let dataHistory = {
  nodeA: [],
  nodeB: []
};

// 待执行的控制指令队列
let commandQueue = {
  nodeA: [],
  nodeB: []
};

// ==================== 接口1：ESP8266 上传传感器数据 ====================
/**
 * 接收ESP8266上传的传感器数据
 * 
 * 请求示例：
 * POST /api/data
 * {
 *   "node_id": "nodeA",
 *   "temperature": 25.5,
 *   "humidity": 62,
 *   "light": 450
 * }
 * 
 * 响应示例：
 * {
 *   "status": "success",
 *   "message": "Data received",
 *   "data": {
 *     "temp": 25.5,
 *     "humidity": 62,
 *     "light": 450,
 *     "timestamp": "2026-04-26T12:34:56.789Z",
 *     "status": "online"
 *   }
 * }
 */
app.post('/api/data', (req, res) => {
  const { node_id, temperature, humidity, light } = req.body;

  console.log('\n📤 收到数据上传:');
  console.log('  节点ID:', node_id);
  console.log('  温度:', temperature, '°C');
  console.log('  湿度:', humidity, '%');
  console.log('  光照:', light, 'lux');

  // 参数验证
  if (!node_id || typeof temperature !== 'number' || typeof humidity !== 'number' || typeof light !== 'number') {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid parameters. Required: node_id, temperature, humidity, light'
    });
  }

  if (!latestData[node_id]) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid node_id. Must be nodeA or nodeB'
    });
  }

  // 更新最新数据
  const timestamp = new Date().toISOString();
  latestData[node_id] = {
    temp: temperature,
    humidity: humidity,
    light: light,
    timestamp: timestamp,
    status: 'online'
  };

  // 保存到历史数据
  dataHistory[node_id].push({
    temp: temperature,
    humidity: humidity,
    light: light,
    timestamp: timestamp
  });

  // 保留最近100条
  if (dataHistory[node_id].length > 100) {
    dataHistory[node_id].shift();
  }

  console.log('✅ 数据已保存');

  res.json({
    status: 'success',
    message: 'Data received',
    data: latestData[node_id]
  });
});

// ==================== 接口2：查询所有节点最新数据 ====================
/**
 * APP查询所有节点的最新数据
 * 
 * 请求示例：
 * GET /api/data
 * 
 * 响应示例：
 * {
 *   "status": "success",
 *   "data": {
 *     "nodeA": {...},
 *     "nodeB": {...}
 *   },
 *   "timestamp": "2026-04-26T12:34:56.789Z"
 * }
 */
app.get('/api/data', (req, res) => {
  console.log('📥 APP查询所有数据');

  res.json({
    status: 'success',
    data: latestData,
    timestamp: new Date().toISOString()
  });
});

// ==================== 接口3：查询单个节点最新数据 ====================
/**
 * APP查询单个节点的最新数据
 * 
 * 请求示例：
 * GET /api/data/nodeA
 */
app.get('/api/data/:nodeId', (req, res) => {
  const nodeId = req.params.nodeId;
  console.log('📥 APP查询节点:', nodeId);

  if (!latestData[nodeId]) {
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  res.json({
    status: 'success',
    node_id: nodeId,
    data: latestData[nodeId],
    timestamp: new Date().toISOString()
  });
});

// ==================== 接口4：查询节点历史数据 ====================
/**
 * APP查询节点的历史数据
 * 
 * 请求示例：
 * GET /api/data/nodeA/history?limit=10
 * 
 * 响应示例：
 * {
 *   "status": "success",
 *   "node_id": "nodeA",
 *   "count": 10,
 *   "data": [
 *     {"temp": 25.5, "humidity": 62, "light": 450, "timestamp": "..."},
 *     ...
 *   ]
 * }
 */
app.get('/api/data/:nodeId/history', (req, res) => {
  const nodeId = req.params.nodeId;
  const limit = parseInt(req.query.limit) || 10;

  console.log('📊 APP查询历史数据:', nodeId, '最近', limit, '条');

  if (!dataHistory[nodeId]) {
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  const history = dataHistory[nodeId].slice(-limit);

  res.json({
    status: 'success',
    node_id: nodeId,
    count: history.length,
    data: history,
    timestamp: new Date().toISOString()
  });
});

// ==================== 接口5：健康检查 ====================
/**
 * 服务器健康检查
 * 
 * 请求示例：
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ==================== 接口6：获取服务器状态 ====================
/**
 * 获取服务器详细状态
 * 
 * 请求示例：
 * GET /api/status
 */
app.get('/api/status', (req, res) => {
  console.log('📊 APP查询服务器状态');

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    nodes: {
      nodeA: {
        status: latestData.nodeA.status,
        last_update: latestData.nodeA.timestamp,
        data_count: dataHistory.nodeA.length
      },
      nodeB: {
        status: latestData.nodeB.status,
        last_update: latestData.nodeB.timestamp,
        data_count: dataHistory.nodeB.length
      }
    },
    uptime: process.uptime()
  });
});

// ==================== 接口7：APP发送控制指令 ====================
/**
 * APP发送控制指令给节点（HTTP轮询方式）
 * 
 * 请求示例：
 * POST /api/command/nodeA
 * {
 *   "action": "pump_on",
 *   "value": 30
 * }
 * 
 * 响应示例：
 * {
 *   "status": "success",
 *   "message": "Command queued",
 *   "command_id": 1704067255000
 * }
 */
app.post('/api/command/:nodeId', (req, res) => {
  const nodeId = req.params.nodeId;
  const { action, value } = req.body;

  console.log('\n📮 APP发送指令:');
  console.log('  节点:', nodeId);
  console.log('  动作:', action);
  console.log('  参数:', value);

  if (!nodeId || !action) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields: nodeId, action'
    });
  }

  if (!latestData[nodeId]) {
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  // 创建指令
  const command = {
    id: Date.now(),
    action: action,
    value: value || null,
    timestamp: new Date().toISOString(),
    status: 'pending'
  };

  // 加入队列
  commandQueue[nodeId].push(command);

  console.log(`✅ 指令已加入队列，队列长度: ${commandQueue[nodeId].length}`);

  res.json({
    status: 'success',
    message: 'Command queued',
    command_id: command.id,
    queue_length: commandQueue[nodeId].length
  });
});

// ==================== 接口8：ESP8266查询待执行指令 ====================
/**
 * ESP8266定期查询是否有待执行的指令
 * 
 * 请求示例：
 * GET /api/command/nodeA
 * 
 * 响应示例1（有指令）：
 * {
 *   "status": "success",
 *   "has_command": true,
 *   "command": {
 *     "id": 1704067255000,
 *     "action": "pump_on",
 *     "value": 30,
 *     "timestamp": "...",
 *     "status": "pending"
 *   }
 * }
 * 
 * 响应示例2（无指令）：
 * {
 *   "status": "success",
 *   "has_command": false
 * }
 */
app.get('/api/command/:nodeId', (req, res) => {
  const nodeId = req.params.nodeId;

  console.log('❓ ESP8266查询指令:', nodeId);

  if (!commandQueue[nodeId]) {
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  if (commandQueue[nodeId].length > 0) {
    const command = commandQueue[nodeId][0];
    console.log(`✅ 返回指令给${nodeId}: ${command.action}`);

    res.json({
      status: 'success',
      has_command: true,
      command: command
    });
  } else {
    console.log(`ℹ️  ${nodeId}无待执行指令`);

    res.json({
      status: 'success',
      has_command: false
    });
  }
});

// ==================== 接口9：ESP8266确认指令已执行 ====================
/**
 * ESP8266确认指令已执行
 * 
 * 请求示例：
 * POST /api/command/nodeA/ack
 * {
 *   "command_id": 1704067255000,
 *   "result": "success"
 * }
 */
app.post('/api/command/:nodeId/ack', (req, res) => {
  const nodeId = req.params.nodeId;
  const { command_id, result } = req.body;

  console.log('\n✅ 指令执行确认:');
  console.log('  节点:', nodeId);
  console.log('  指令ID:', command_id);
  console.log('  结果:', result);

  if (!commandQueue[nodeId] || commandQueue[nodeId].length === 0) {
    return res.status(400).json({
      status: 'error',
      message: 'No command to acknowledge'
    });
  }

  // 从队列中移除已执行的指令
  const executedCommand = commandQueue[nodeId].shift();
  executedCommand.status = 'completed';
  executedCommand.result = result;

  res.json({
    status: 'success',
    message: 'Command acknowledged'
  });
});

// ==================== 接口10：查询所有待执行指令 ====================
/**
 * APP查询所有待执行指令
 * 
 * 请求示例：
 * GET /api/commands
 */
app.get('/api/commands', (req, res) => {
  console.log('📋 APP查询所有待执行指令');

  res.json({
    status: 'success',
    commands: commandQueue,
    timestamp: new Date().toISOString()
  });
});

// ==================== 接口11：清空指令队列 ====================
/**
 * 清空指定节点的指令队列（仅用于调试）
 * 
 * 请求示例：
 * DELETE /api/command/nodeA
 */
app.delete('/api/command/:nodeId', (req, res) => {
  const nodeId = req.params.nodeId;

  console.log('🗑️  清空指令队列:', nodeId);

  if (!commandQueue[nodeId]) {
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  const count = commandQueue[nodeId].length;
  commandQueue[nodeId] = [];

  res.json({
    status: 'success',
    message: `Cleared ${count} commands`
  });
});

// ==================== 接口12：重置所有数据 ====================
/**
 * 重置所有数据（仅用于调试/测试）
 * 
 * 请求示例：
 * DELETE /api/data/reset
 */
app.delete('/api/data/reset', (req, res) => {
  console.log('🔄 重置所有数据');

  latestData = {
    nodeA: { temp: 0, humidity: 0, light: 0, timestamp: null, status: 'offline' },
    nodeB: { temp: 0, humidity: 0, light: 0, timestamp: null, status: 'offline' }
  };

  dataHistory = {
    nodeA: [],
    nodeB: []
  };

  commandQueue = {
    nodeA: [],
    nodeB: []
  };

  res.json({
    status: 'success',
    message: 'All data reset'
  });
});

// ==================== 启动服务器 ====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 智慧大棚服务器启动成功！`);
  console.log(`📡 监听端口: ${PORT}`);
  console.log(`${'='.repeat(70)}`);

  console.log(`\n📚 API接口列表：`);
  console.log(`\n  【数据采集 - ESP8266使用】`);
  console.log(`    POST /api/data                    - 上传传感器数据`);
  console.log(`    GET  /api/command/:nodeId         - 查询待执行指令`);
  console.log(`    POST /api/command/:nodeId/ack     - 确认指令已执行`);

  console.log(`\n  【数据查询 - APP使用】`);
  console.log(`    GET  /api/data                    - 查询所有节点最新数据`);
  console.log(`    GET  /api/data/:nodeId            - 查询单个节点最新数据`);
  console.log(`    GET  /api/data/:nodeId/history    - 查询节点历史数据`);
  console.log(`    GET  /api/status                  - 查询服务器状态`);

  console.log(`\n  【控制指令 - APP使用】`);
  console.log(`    POST /api/command/:nodeId         - 发送控制指令`);
  console.log(`    GET  /api/commands                - 查询所有待执行指令`);
  console.log(`    DELETE /api/command/:nodeId       - 清空指令队列（调试用）`);

  console.log(`\n  【其他】`);
  console.log(`    GET  /api/health                  - 健康检查`);
  console.log(`    DELETE /api/data/reset            - 重置所有数据（调试用）`);

  console.log(`\n${'='.repeat(70)}\n`);
});