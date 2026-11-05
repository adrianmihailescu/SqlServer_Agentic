
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

// Tool 2: Run fixed, read-only checks for the customer tables
server.registerTool(
    "run_customer_table_tests",
    {
        description:
            "Run allowlisted, read-only metadata and aggregate checks against dbo.Customers and dbo.NewCustomers. Does not accept SQL or return customer names or email values. A CreatedAt NULL count does not prove that the default works.",
        inputSchema: {
            tables: z.array(z.enum(["Customers", "NewCustomers"])).min(1),
            tests: z.array(z.enum([
                "schema",
                "row_count",
                "required_names",
                "created_at_nulls"
            ])).min(1)
        }
    },
    async ({ tables, tests }) => {
        try {
            pool ??= await sql.connect(dbConfig);

            const testQueries = {
                schema: `
                    SELECT
                        c.name AS ColumnName,
                        TYPE_NAME(c.user_type_id) AS DataType,
                        c.max_length AS MaxLengthBytes,
                        c.is_nullable AS IsNullable,
                        c.is_identity AS IsIdentity,
                        CONVERT(bit, CASE WHEN c.default_object_id <> 0 THEN 1 ELSE 0 END) AS HasDefault
                    FROM sys.columns AS c
                    WHERE c.object_id = @objectId
                    ORDER BY c.column_id;
                `,
                row_count: (table) =>
                    `SELECT COUNT_BIG(*) AS TotalRows FROM dbo.[${table}];`,
                required_names: (table) =>
                    `SELECT COUNT_BIG(*) AS ViolatingRows FROM dbo.[${table}] WHERE FirstName IS NULL OR LastName IS NULL;`,
                created_at_nulls: (table) =>
                    `SELECT COUNT_BIG(*) AS NullCreatedAtRows FROM dbo.[${table}] WHERE CreatedAt IS NULL;`
            };

            const results = [];

            for (const table of [...new Set(tables)]) {
                const qualifiedName = `dbo.${table}`;
                const objectResult = await pool.request()
                    .input("qualifiedName", sql.NVarChar(257), qualifiedName)
                    .query("SELECT OBJECT_ID(@qualifiedName, N'U') AS ObjectId;");
                const objectId = objectResult.recordset[0].ObjectId;

                if (objectId === null) {
                    results.push({
                        table: qualifiedName,
                        exists: false,
                        tests: []
                    });
                    continue;
                }

                const tableResults = [];

                for (const test of [...new Set(tests)]) {
                    const request = pool.request();
                    let result;

                    if (test === "schema") {
                        result = await request
                            .input("objectId", sql.Int, objectId)
                            .query(testQueries.schema);
                    } else {
                        result = await request.query(testQueries[test](table));
                    }

                    tableResults.push({
                        test,
                        rows: result.recordset
                    });
                }

                results.push({
                    table: qualifiedName,
                    exists: true,
                    tests: tableResults
                });
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(results, null, 2)
                }]
            };
        } catch (error) {
            return {
                isError: true,
                content: [{
                    type: "text",
                    text: `Customer table validation failed: ${error.message}`
                }]
            };
        }
    }
);

// Tool 3: Create a database object
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
