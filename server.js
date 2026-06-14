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

// ==================== 简化的阈值配置存储 ====================
let thresholdConfig = {
  nodeA: {
    temperature_max: 30,
    light_min: 100,
    updated_at: null,
    updated_by: "system"
  },
  nodeB: {
    temperature_max: 30,
    light_min: 100,
    updated_at: null,
    updated_by: "system"
  }
};

// ==================== 新增：阈值下发状态追踪 ====================
let thresholdPushStatus = {
  nodeA: { status: 'idle', updated_at: null, pushed_at: null, confirmed_at: null },
  nodeB: { status: 'idle', updated_at: null, pushed_at: null, confirmed_at: null }
};

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

// ==================== 已执行指令历史（保留最近100条） ====================
let commandHistory = {
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
        data_count: dataHistory.nodeA.length,
        pending_commands: commandQueue.nodeA.length,
        completed_commands: commandHistory.nodeA.length,
        threshold: thresholdConfig.nodeA,
        threshold_push_status: thresholdPushStatus.nodeA   // 新增
      },
      nodeB: {
        status: latestData.nodeB.status,
        last_update: latestData.nodeB.timestamp,
        data_count: dataHistory.nodeB.length,
        pending_commands: commandQueue.nodeB.length,
        completed_commands: commandHistory.nodeB.length,
        threshold: thresholdConfig.nodeB,
        threshold_push_status: thresholdPushStatus.nodeB   // 新增
      }
    },
    uptime: process.uptime()
  });
});

// ==================== 接口7：APP发送控制指令 ====================
/**
 * APP发送控制指令给节点
 *
 * 请求示例：
 * POST /api/command/nodeA
 * {
 *   "action": "FAN_ON",
 *   "value": 30
 * }
 *
 * 响应新增字段：
 * {
 *   "status": "success",
 *   "message": "Command queued",
 *   "command_id": 1704067255000,
 *   "queue_length": 1,
 *   "result_query": {                          // 新增：告知APP如何轮询结果
 *     "method": "GET",
 *     "url": "/api/command/nodeA/result/1704067255000",
 *     "description": "每2秒查询一次，90秒超时"
 *   }
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
    queue_length: commandQueue[nodeId].length,
    // ==================== 新增：引导APP轮询结果 ====================
    result_query: {
      method: 'GET',
      url: `/api/command/${nodeId}/result/${command.id}`,
      description: '请使用此接口轮询查询指令执行结果，建议每2秒查询一次，超时时间建议90秒'
    }
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
 *   "command": { "id":..., "action":..., "value":... }
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
 *   "result": "success"   // 或 "failed" / "timeout"
 * }
 */
app.post('/api/command/:nodeId/ack', (req, res) => {
  const nodeId = req.params.nodeId;
  const { command_id, result } = req.body;

  console.log('\n✅ 指令执行确认:');
  console.log('  节点:', nodeId);
  console.log('  指令ID:', command_id);
  console.log('  执行结果:', result);

  // ==================== 参数验证 ====================
  if (!nodeId || !command_id) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields: nodeId and command_id'
    });
  }

  if (!commandQueue[nodeId]) {
    console.log('  ❌ 节点不存在');
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  if (commandQueue[nodeId].length === 0) {
    console.log('  ⚠️  队列为空，无指令可确认');
    return res.status(400).json({
      status: 'error',
      message: 'No command in queue to acknowledge'
    });
  }

  // ==================== 获取队列中的第一个指令 ====================
  const firstCommand = commandQueue[nodeId][0];

  console.log('  队列中第一个指令ID:', firstCommand.id);
  console.log('  队列中第一个指令:', firstCommand.action);

  // ==================== 检查command_id是否匹配 ====================
  if (Number(firstCommand.id) !== Number(command_id)) {
    console.log(`  ❌ ID不匹配!`);
    console.log(`     期望: ${firstCommand.id}`);
    console.log(`     实际: ${command_id}`);
    return res.status(400).json({
      status: 'error',
      message: 'Command ID mismatch',
      expected_id: firstCommand.id,
      received_id: command_id
    });
  }

  // ==================== ID匹配，从队列中移除指令 ====================
  const executedCommand = commandQueue[nodeId].shift();
  executedCommand.status = result === 'success' ? 'completed' : 'failed';
  executedCommand.result = result;
  executedCommand.completed_at = new Date().toISOString();

  // ==================== 保存到历史记录 ====================
  commandHistory[nodeId].push(executedCommand);
  if (commandHistory[nodeId].length > 100) {
    commandHistory[nodeId].shift();
  }

  // ==================== 新增：阈值指令ACK同步更新thresholdPushStatus ====================
  const thresholdActions = ['TEMP_MAX', 'LIGHT_MIN', 'temp_max', 'light_min'];
  if (thresholdActions.includes(executedCommand.action)) {
    if (result === 'success') {
      thresholdPushStatus[nodeId].status = 'confirmed';
      thresholdPushStatus[nodeId].confirmed_at = new Date().toISOString();
      console.log(`  ⚙️  阈值指令执行成功: ${executedCommand.action}`);
    } else {
      thresholdPushStatus[nodeId].status = result;   // failed 或 timeout
      console.log(`  ⚙️  阈值指令执行失败: ${executedCommand.action} → ${result}`);
    }
  }

  // ==================== 打印执行结果日志 ====================
  if (result === 'success') {
    console.log(`  ✅ 指令执行成功！`);
  } else if (result === 'failed') {
    console.log(`  ❌ 指令执行失败！`);
  } else if (result === 'timeout') {
    console.log(`  ⏱️  指令执行超时！`);
  } else {
    console.log(`  ⚠️  指令执行状态未知: ${result}`);
  }

  console.log(`  当前队列长度: ${commandQueue[nodeId].length}`);
  console.log(`  历史记录数: ${commandHistory[nodeId].length}`);

  res.json({
    status: 'success',
    message: 'Command acknowledged',
    removed_command: {
      id: executedCommand.id,
      action: executedCommand.action,
      result: result,
      completed_at: executedCommand.completed_at
    }
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

// ==================== 接口11：查询已执行指令历史 ====================
/**
 * APP查询已执行的指令历史
 *
 * 请求示例：
 * GET /api/command-history/nodeA?limit=10
 */
app.get('/api/command-history/:nodeId', (req, res) => {
  const nodeId = req.params.nodeId;
  const limit = parseInt(req.query.limit) || 10;

  console.log('📊 APP查询指令历史:', nodeId, '最近', limit, '条');

  if (!commandHistory[nodeId]) {
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  const history = commandHistory[nodeId].slice(-limit);

  res.json({
    status: 'success',
    node_id: nodeId,
    count: history.length,
    data: history,
    timestamp: new Date().toISOString()
  });
});

// ==================== 接口12：查询指令执行统计 ====================
/**
 * APP查询指令执行统计
 *
 * 请求示例：
 * GET /api/command-stats/nodeA
 */
app.get('/api/command-stats/:nodeId', (req, res) => {
  const nodeId = req.params.nodeId;

  console.log('📈 APP查询指令统计:', nodeId);

  if (!commandHistory[nodeId]) {
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  const total = commandHistory[nodeId].length;
  const successful = commandHistory[nodeId].filter(cmd => cmd.result === 'success').length;
  const failed = commandHistory[nodeId].filter(cmd => cmd.result === 'failed').length;
  const timeout = commandHistory[nodeId].filter(cmd => cmd.result === 'timeout').length;
  const successRate = total > 0 ? ((successful / total) * 100).toFixed(2) : 0;

  res.json({
    status: 'success',
    node_id: nodeId,
    total: total,
    successful: successful,
    failed: failed,
    timeout: timeout,
    success_rate: successRate + '%',
    timestamp: new Date().toISOString()
  });
});

// ==================== 接口13：清空指令队列 ====================
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

// ==================== 接口14：清空指令历史 ====================
/**
 * 清空指定节点的指令历史（仅用于调试）
 *
 * 请求示例：
 * DELETE /api/command-history/nodeA
 */
app.delete('/api/command-history/:nodeId', (req, res) => {
  const nodeId = req.params.nodeId;

  console.log('🗑️  清空指令历史:', nodeId);

  if (!commandHistory[nodeId]) {
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  const count = commandHistory[nodeId].length;
  commandHistory[nodeId] = [];

  res.json({
    status: 'success',
    message: `Cleared ${count} command history records`
  });
});

// ==================== 接口15：重置所有数据 ====================
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

  commandHistory = {
    nodeA: [],
    nodeB: []
  };

  thresholdConfig = {
    nodeA: {
      temperature_max: 30,
      light_min: 100,
      updated_at: null,
      updated_by: "system"
    },
    nodeB: {
      temperature_max: 30,
      light_min: 100,
      updated_at: null,
      updated_by: "system"
    }
  };

  // ==================== 新增：同步重置阈值下发状态 ====================
  thresholdPushStatus = {
    nodeA: { status: 'idle', updated_at: null, pushed_at: null, confirmed_at: null },
    nodeB: { status: 'idle', updated_at: null, pushed_at: null, confirmed_at: null }
  };

  res.json({
    status: 'success',
    message: 'All data reset'
  });
});

// ==================== 接口16：APP设置阈值 ====================
/**
 * APP设置阈值，同时将阈值变更作为指令入队，支持ACK追踪
 *
 * 请求示例：
 * POST /api/threshold/nodeA
 * {
 *   "temperature_max": 35,
 *   "light_min": 500
 * }
 *
 * 响应新增字段：
 * {
 *   "status": "success",
 *   "threshold": {...},
 *   "queued_commands": [          // 新增：可用于轮询执行结果
 *     {
 *       "command_id": 1704067255000,
 *       "action": "TEMP_MAX",
 *       "value": 35,
 *       "result_query": "/api/command/nodeA/result/1704067255000"
 *     }
 *   ]
 * }
 */
app.post('/api/threshold/:nodeId', (req, res) => {
  const nodeId = req.params.nodeId;
  const { temperature_max, light_min } = req.body;

  console.log('\n⚙️  APP设置阈值:');
  console.log('  节点:', nodeId);
  console.log('  温度上限:', temperature_max, '°C');
  console.log('  光照下限:', light_min, 'lux');

  if (!nodeId) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing nodeId'
    });
  }

  if (!thresholdConfig[nodeId]) {
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  // ==================== 数据验证 ====================
  const errors = [];

  if (temperature_max !== undefined) {
    if (typeof temperature_max !== 'number' || temperature_max < 15 || temperature_max > 50) {
      errors.push('temperature_max must be between 15 and 50');
    }
  }

  if (light_min !== undefined) {
    if (typeof light_min !== 'number' || light_min < 0 || light_min > 10000) {
      errors.push('light_min must be between 0 and 10000');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid parameters',
      errors: errors
    });
  }

  // ==================== 更新阈值 ====================
  if (temperature_max !== undefined) thresholdConfig[nodeId].temperature_max = temperature_max;
  if (light_min !== undefined) thresholdConfig[nodeId].light_min = light_min;

  thresholdConfig[nodeId].updated_at = new Date().toISOString();
  thresholdConfig[nodeId].updated_by = 'app';

  // ==================== 新增：阈值变更作为指令入队，支持ACK追踪 ====================
  const thresholdCommands = [];

  if (temperature_max !== undefined) {
    const cmd = {
      id: Date.now(),
      action: 'TEMP_MAX',
      value: temperature_max,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    commandQueue[nodeId].push(cmd);
    thresholdCommands.push(cmd);
  }

  if (light_min !== undefined) {
    const cmd = {
      id: Date.now() + 1,    // +1 防止同毫秒导致ID重复
      action: 'LIGHT_MIN',
      value: light_min,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    commandQueue[nodeId].push(cmd);
    thresholdCommands.push(cmd);
  }

  // ==================== 新增：更新阈值下发状态 ====================
  thresholdPushStatus[nodeId] = {
    status: 'pending',
    updated_at: thresholdConfig[nodeId].updated_at,
    pushed_at: new Date().toISOString(),
    confirmed_at: null
  };

  console.log('✅ 阈值已更新并加入指令队列');

  res.json({
    status: 'success',
    message: 'Threshold updated and queued for delivery',
    threshold: thresholdConfig[nodeId],
    // ==================== 新增：返回可追踪的指令信息 ====================
    queued_commands: thresholdCommands.map(cmd => ({
      command_id: cmd.id,
      action: cmd.action,
      value: cmd.value,
      result_query: `/api/command/${nodeId}/result/${cmd.id}`
    }))
  });
});

// ==================== 接口17：查询阈值 ====================
app.get('/api/threshold/:nodeId', (req, res) => {
  const nodeId = req.params.nodeId;

  console.log('🔍 APP查询阈值:', nodeId);

  if (!thresholdConfig[nodeId]) {
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  res.json({
    status: 'success',
    node_id: nodeId,
    threshold: thresholdConfig[nodeId],
    timestamp: new Date().toISOString()
  });
});

// ==================== 接口18：ESP8266查询阈值 ====================
app.get('/api/threshold/:nodeId/config', (req, res) => {
  const nodeId = req.params.nodeId;

  console.log('📥 ESP8266查询阈值:', nodeId);

  if (!thresholdConfig[nodeId]) {
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  res.json({
    status: 'success',
    node_id: nodeId,
    threshold: {
      temperature_max: thresholdConfig[nodeId].temperature_max,
      light_min: thresholdConfig[nodeId].light_min
    },
    timestamp: new Date().toISOString()
  });
});

// ==================== 接口19：重置阈值为默认值 ====================
app.post('/api/threshold/:nodeId/reset', (req, res) => {
  const nodeId = req.params.nodeId;

  console.log('🔄 重置阈值:', nodeId);

  if (!thresholdConfig[nodeId]) {
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  thresholdConfig[nodeId] = {
    temperature_max: 30,
    light_min: 100,
    updated_at: new Date().toISOString(),
    updated_by: 'system'
  };

  // ==================== 新增：重置时同步清除下发状态 ====================
  thresholdPushStatus[nodeId] = {
    status: 'idle',
    updated_at: new Date().toISOString(),
    pushed_at: null,
    confirmed_at: null
  };

  console.log('✅ 阈值已重置为默认值');

  res.json({
    status: 'success',
    message: 'Threshold reset to default',
    threshold: thresholdConfig[nodeId]
  });
});

// ==================== 新增接口20：APP查询单条指令执行结果 ====================
/**
 * APP通过command_id精确查询单条指令的执行状态
 *
 * 请求示例：
 * GET /api/command/nodeA/result/1704067255000
 *
 * 响应示例1（指令还在队列中，未执行）：
 * {
 *   "status": "success",
 *   "command_id": 1704067255000,
 *   "execute_status": "pending",
 *   "command": { "id":..., "action":"FAN_ON", "value":30, ... }
 * }
 *
 * 响应示例2（指令已执行）：
 * {
 *   "status": "success",
 *   "command_id": 1704067255000,
 *   "execute_status": "success",    // 或 "failed" / "timeout"
 *   "command": { "id":..., "action":"FAN_ON", "result":"success", "completed_at":"..." }
 * }
 *
 * 响应示例3（找不到该指令）：
 * {
 *   "status": "error",
 *   "message": "Command not found"
 * }
 */
app.get('/api/command/:nodeId/result/:commandId', (req, res) => {
  const nodeId = req.params.nodeId;
  const commandId = Number(req.params.commandId);

  console.log('🔍 APP查询指令结果:', nodeId, 'commandId:', commandId);

  if (!commandQueue[nodeId] || !commandHistory[nodeId]) {
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  // 先在待执行队列中查找（说明还未执行完）
  const pendingCmd = commandQueue[nodeId].find(cmd => Number(cmd.id) === commandId);
  if (pendingCmd) {
    return res.json({
      status: 'success',
      command_id: commandId,
      execute_status: 'pending',
      command: pendingCmd
    });
  }

  // 再在历史记录中查找（已执行完成）
  const doneCmd = commandHistory[nodeId].find(cmd => Number(cmd.id) === commandId);
  if (doneCmd) {
    return res.json({
      status: 'success',
      command_id: commandId,
      execute_status: doneCmd.result,    // success / failed / timeout
      command: doneCmd
    });
  }

  // 都找不到
  return res.status(404).json({
    status: 'error',
    message: 'Command not found',
    command_id: commandId
  });
});

// ==================== 新增接口21：查询阈值下发状态 ====================
/**
 * APP查询阈值是否已成功下发到硬件
 *
 * 请求示例：
 * GET /api/threshold/nodeA/push-status
 *
 * 响应示例：
 * {
 *   "status": "success",
 *   "node_id": "nodeA",
 *   "push_status": {
 *     "status": "confirmed",      // idle / pending / confirmed / failed / timeout
 *     "updated_at": "...",        // APP最后一次设置阈值的时间
 *     "pushed_at": "...",         // 指令入队时间
 *     "confirmed_at": "..."       // STM32确认执行完成的时间
 *   },
 *   "current_threshold": { "temperature_max": 35, "light_min": 500 }
 * }
 */
app.get('/api/threshold/:nodeId/push-status', (req, res) => {
  const nodeId = req.params.nodeId;

  console.log('📡 APP查询阈值下发状态:', nodeId);

  if (!thresholdPushStatus[nodeId]) {
    return res.status(404).json({
      status: 'error',
      message: 'Node not found'
    });
  }

  res.json({
    status: 'success',
    node_id: nodeId,
    push_status: thresholdPushStatus[nodeId],
    current_threshold: thresholdConfig[nodeId],
    timestamp: new Date().toISOString()
  });
});

// ==================== 指令队列超时自动清理（定时任务） ====================
const CMD_TIMEOUT_MS = 120000;   // 指令超时时间：120秒（给ESP8266的60秒ACK留余量）
const CLEANUP_INTERVAL_MS = 10000; // 每10秒检查一次

setInterval(() => {
  const now = Date.now();
  for (const nodeId of ['nodeA', 'nodeB']) {
    const queue = commandQueue[nodeId];
    
    // 只检查队首（ESP8266是按顺序取的，队首最早）
    while (queue.length > 0) {
      const firstCmd = queue[0];
      const cmdTime = new Date(firstCmd.timestamp).getTime();  // ISO字符串转数字时间戳
      
      if (now - cmdTime > CMD_TIMEOUT_MS) {
        // 超时，从队列移除
        const timeoutCmd = queue.shift();
        timeoutCmd.status = 'timeout';
        timeoutCmd.result = 'timeout';
        timeoutCmd.completed_at = new Date().toISOString();
        
        // 存入历史记录
        commandHistory[nodeId].push(timeoutCmd);
        if (commandHistory[nodeId].length > 100) {
          commandHistory[nodeId].shift();
        }
        
        // 如果是阈值指令，同步更新下发状态
        const thresholdActions = ['TEMP_MAX', 'LIGHT_MIN', 'temp_max', 'light_min'];
        if (thresholdActions.includes(timeoutCmd.action)) {
          thresholdPushStatus[nodeId].status = 'timeout';
        }
        
        console.log(`⏱️  [超时清理] ${nodeId} 指令超时: ${timeoutCmd.action} (ID: ${timeoutCmd.id})`);
      } else {
        // 队首没超时，后面的更不会超时，直接跳出
        break;
      }
    }
  }
}, CLEANUP_INTERVAL_MS);

// ==================== 启动服务器 ====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 智慧大棚服务器启动成功！`);
  console.log(`📡 监听端口: ${PORT}`);
  console.log(`${'='.repeat(70)}`);

  console.log(`\n📚 API接口列表：`);

  console.log(`\n  【数据采集 - ESP8266使用】`);
  console.log(`    POST /api/data                              - 上传传感器数据`);
  console.log(`    GET  /api/command/:nodeId                   - 查询待执行指令`);
  console.log(`    POST /api/command/:nodeId/ack              - 确认指令已执行`);

  console.log(`\n  【数据查询 - APP使用】`);
  console.log(`    GET  /api/data                             - 查询所有节点最新数据`);
  console.log(`    GET  /api/data/:nodeId                     - 查询单个节点最新数据`);
  console.log(`    GET  /api/data/:nodeId/history             - 查询节点历史数据`);
  console.log(`    GET  /api/status                           - 查询服务器状态`);

  console.log(`\n  【控制指令 - APP使用】`);
  console.log(`    POST /api/command/:nodeId                  - 发送控制指令`);
  console.log(`    GET  /api/command/:nodeId/result/:cmdId    - 查询单条指令执行结果 ✨新增`);
  console.log(`    GET  /api/commands                         - 查询所有待执行指令`);
  console.log(`    GET  /api/command-history/:nodeId          - 查询已执行指令历史`);
  console.log(`    GET  /api/command-stats/:nodeId            - 查询指令执行统计`);

  console.log(`\n  【阈值管理 - APP使用】`);
  console.log(`    POST /api/threshold/:nodeId                - 设置阈值（含ACK追踪）✨更新`);
  console.log(`    GET  /api/threshold/:nodeId                - 查询阈值`);
  console.log(`    GET  /api/threshold/:nodeId/push-status    - 查询阈值下发状态 ✨新增`);
  console.log(`    POST /api/threshold/:nodeId/reset          - 重置阈值为默认值`);
  console.log(`    GET  /api/threshold/:nodeId/config         - ESP8266查询阈值`);

  console.log(`\n  【调试接口】`);
  console.log(`    GET  /api/health                           - 健康检查`);
  console.log(`    DELETE /api/command/:nodeId                - 清空指令队列`);
  console.log(`    DELETE /api/command-history/:nodeId        - 清空指令历史`);
  console.log(`    DELETE /api/data/reset                     - 重置所有数据`);

  console.log(`\n${'='.repeat(70)}\n`);
});