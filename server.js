const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

// 跨域支持
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ==================== 数据存储 ====================
let latestData = {
  nodeA: { 
    temp: 0, 
    humidity: 0, 
    light: 0, 
    timestamp: null 
  },
  nodeB: { 
    temp: 0, 
    humidity: 0, 
    light: 0, 
    timestamp: null 
  }
};

// ==================== ESP8266 上传数据 ====================
app.post('/api/data', (req, res) => {
  const { node_id, temperature, humidity, light } = req.body;
  
  console.log('📤 收到数据上传:');
  console.log('  节点ID:', node_id);
  console.log('  温度:', temperature);
  console.log('  湿度:', humidity);
  console.log('  光照:', light);
  
  if(!node_id) {
    return res.status(400).json({ error: 'node_id required' });
  }
  
  // 更新数据
  latestData[node_id] = {
    temp: temperature,
    humidity: humidity,
    light: light,
    timestamp: new Date().toISOString()
  };
  
  res.json({ 
    status: 'success', 
    message: 'Data received',
    data: latestData[node_id]
  });
});

// ==================== APP 查询所有数据 ====================
app.get('/api/data', (req, res) => {
  console.log('📥 APP 查询所有数据');
  res.json(latestData);
});

// ==================== APP 查询单个节点 ====================
app.get('/api/data/:nodeId', (req, res) => {
  const nodeId = req.params.nodeId;
  console.log('📥 APP 查询节点:', nodeId);
  
  if(latestData[nodeId]) {
    res.json(latestData[nodeId]);
  } else {
    res.status(404).json({ error: 'Node not found' });
  }
});

// ==================== 健康检查 ====================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString()
  });
});

// ==================== 启动服务 ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 服务器启动成功！`);
  console.log(`📡 监听端口: ${PORT}`);
  console.log(`\n可用接口：`);
  console.log(`  POST http://localhost:${PORT}/api/data (ESP8266上传数据)`);
  console.log(`  GET  http://localhost:${PORT}/api/data (APP查询所有数据)`);
  console.log(`  GET  http://localhost:${PORT}/api/health (健康检查)\n`);
});