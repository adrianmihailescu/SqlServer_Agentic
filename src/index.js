
import "dotenv/config";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sql = require("mssql/msnodesqlv8");

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSqlTools } from "./tools.js";

// SQL Server connection
const dbConfig = {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,

    driver: "ODBC Driver 18 for SQL Server",

    options: {
        trustedConnection: true,
        encrypt: true,
        trustServerCertificate: true
    },
    beforeConnect: (config) => {
        config.conn_str += ";TrustServerCertificate=yes";
    },

    connectionTimeout: 15000,
    requestTimeout: 30000
};

// Create MCP server
const server = new McpServer({
    name: "sqlserver",
    version: "1.0.0"
});

registerSqlTools(server, sql, dbConfig);

// Start MCP server
const transport = new StdioServerTransport();

try {
    console.error("[SQL MCP] Starting server...");

    await server.connect(transport);

    console.error("[SQL MCP] Server connected and ready.");
}
catch (error) {
    console.error("[SQL MCP] Startup failed:", error);
    process.exit(1);
}
