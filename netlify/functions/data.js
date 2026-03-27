const fs = require('fs');
const path = require('path');

exports.handler = async (event, context) => {
  try {
    // Read the dashboard data file
    const dataFile = path.join('/data/.openclaw/workspace/venky-dashboard', 'dashboard-data.json');
    
    if (!fs.existsSync(dataFile)) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Data file not found' })
      };
    }

    const data = fs.readFileSync(dataFile, 'utf-8');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: data
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
