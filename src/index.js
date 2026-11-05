
import "dotenv/config";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sql = require("mssql/msnodesqlv8");

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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

let pool;

// Tool 1: Check database connection
server.registerTool(
    "test_connection",
    {
        description: "Connect to SQL Server and return the current database name",
        inputSchema: {}
    },
    async () => {
        try {
            pool ??= await sql.connect(dbConfig);

            const result = await pool.request().query(
                "SELECT DB_NAME() AS DatabaseName, @@SERVERNAME AS ServerName"
            );

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(result.recordset, null, 2)
                }]
            };
        } catch (error) {
            return {
                isError: true,
                content: [{
                    type: "text",
                    text: error.message
                }]
            };
        }
    }
);

// Tool 2: Create a database object
server.registerTool(
    "execute_ddl",
    {
        description:
            "Create SQL Server database objects. Supports CREATE TABLE, VIEW, PROCEDURE, FUNCTION, INDEX and SCHEMA. Requires explicit confirmation.",
        inputSchema: {
            sql: z.string().min(1).describe("SQL CREATE statement"),
            approvalPhrase: z.literal("CONFIRM CREATE")
        }
    },
    async ({ sql: statement }) => {
        try {
            // Basic safety validation
            const allowed =
                /^\s*CREATE\s+(TABLE|VIEW|PROCEDURE|PROC|FUNCTION|INDEX|SCHEMA)\b/i;

            if (!allowed.test(statement)) {
                throw new Error(
                    "Only CREATE statements for supported objects are allowed."
                );
            }

            // Connect and execute
            pool ??= await sql.connect(dbConfig);

            await pool.request().batch(statement);

            return {
                content: [{
                    type: "text",
                    text: "SQL object created successfully."
                }]
            };
        } catch (error) {
            return {
                isError: true,
                content: [{
                    type: "text",
                    text: `SQL execution failed: ${error.message}`
                }]
            };
        }
    }
);

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
