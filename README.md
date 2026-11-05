# SQL Server Agentic

A Node.js Model Context Protocol (MCP) server that connects an MCP-compatible
client, such as Visual Studio Code, to SQL Server. A workspace agent team
coordinates SQL design, implementation, validation planning, and reporting.

## Architecture

```mermaid
flowchart TB
    C["SQL Coordinator Agent<br/>Understands requirements and delegates work"]
    D["SQL Designer<br/>Plans tables, relationships, constraints, indexes, and DDL"]
    V["SQL Developer<br/>Generates SQL and executes supported CREATE scripts after approval"]
    T["SQL Tester<br/>Reviews scripts, checks connectivity, and prepares test plans"]
    R["SQL Reporter<br/>Documents designs, scripts, results, and known limitations"]
    M["SQL Server MCP Server<br/>Connection check, fixed read-only customer tests, approved CREATE DDL"]
    DB[("SQL Server<br/>Configured database and existing objects")]

    C --> D
    C --> V
    C --> T
    C --> R
    C --> M
    V --> M
    T --> M
    M --> DB
```

The coordinator routes work to specialist agents and consolidates their
evidence-based results. Database access goes through the MCP server. Its
customer validation tool only runs fixed read-only metadata and aggregate
checks; `CREATE` statements still require explicit approval.

## Requirements

- Windows
- Node.js
- SQL Server and a database the Windows account can access
- Microsoft ODBC Driver 18 for SQL Server

The configured driver uses Windows integrated authentication. The Windows
account running the MCP server must have the required SQL Server permissions.

## Setup

1. Install the project dependencies from the repository root:

   ```powershell
   npm install
   ```

2. Create a `.env` file in the repository root:

   ```dotenv
   SQL_SERVER=localhost\SQLEXPRESS
   SQL_DATABASE=YourDatabase
   ```

   Set `SQL_SERVER` to your SQL Server host and, if applicable, named instance.
   Set `SQL_DATABASE` to an existing database. `.env` is excluded from Git.

3. Ensure SQL Server accepts TCP/IP connections. For a named instance using a dynamic port, SQL Server Browser may also need to be running and reachable.
Configure the firewall to allow the SQL Server listener and, when needed, SQL Server Browser.

4. Open the repository as a workspace in Visual Studio Code. The
   `.vscode/mcp.json` configuration starts `src/index.js` as the `sqlserver`
   MCP server and loads settings from `.env`. Start or restart the MCP server
   after changing its configuration or tools.

## Available MCP tools

### `test_connection`

Connects to the configured database and reports its current database and server names. It does not modify the database.

### `execute_ddl`

Executes a `CREATE` statement for a supported SQL Server object: table, view, procedure, function, index, or schema. The caller must provide the exact approval phrase `CONFIRM CREATE`.

The tool checks that the statement starts with a supported `CREATE` keyword.
This check is a convenience guard, not a replacement for appropriate SQL Server permissions. Use a database account with only the permissions the application needs.

### `run_customer_table_tests`

Runs selected, fixed read-only checks against `dbo.Customers` and
`dbo.NewCustomers`. The caller selects table names and test identifiers; the tool does not accept or execute arbitrary SQL. The `schema` check returns only
column name, data type, maximum length, nullability, identity status, and
whether a default is configured. It does not inspect primary-key or unique
constraints. Other checks return row counts, NULL required-name counts, and
NULL `CreatedAt` counts. Results do not include customer names or email values.

These are read-only validation checks, not full unit tests. A NULL `CreatedAt`
count does not prove that the default constraint works on insert; testing that
behavior would require a separately approved data-writing test. The server
does not expose general query execution, data modification, or stored-procedure
execution.

## Workspace agent team

Select **SQL Coordinator** in Visual Studio Code for tasks that need
orchestration. It can delegate to these specialist agents:

- **SQL Designer** — plans schema, relationships, constraints, indexes, and DDL.
- **SQL Developer** — writes SQL and runs supported `CREATE` statements only
  after the user approves the exact SQL with `CONFIRM CREATE`.
- **SQL Tester** — reviews scripts, checks connectivity, and runs fixed
  read-only customer-table checks; it does not execute arbitrary queries or
  stored procedures.
- **SQL Reporter** — documents designs and results based on available evidence;
  it does not query live database contents.

The agent definitions live in `.github/agents/`. The SQL Coordinator and
specialists use the tools currently exposed by this project's MCP server; they
do not bypass those tool limitations. The SQL Reporter documents supplied or
workspace evidence; it does not query live database contents.

Each agent appends meaningful operations to its own
`.github/agents/logs/log_<Agent_Name>.txt` file, using underscores for spaces in the
agent name. Each entry contains a `date yyyy_mm_dd` line followed by an
`operation` summary. These generated logs are excluded from Git.

Automatic subagent delegation uses the VS Code **Local** agent harness. Other
harnesses may let you select the agent profiles individually but may not support
the coordinator's `agents` configuration.

## Connection and TLS notes

The server uses the `mssql` package with its `msnodesqlv8` driver, Windows
integrated authentication, and ODBC Driver 18. Encryption is enabled. The
connection string also sets `TrustServerCertificate=yes` to support local or
self-signed SQL Server certificates.

Trusting the server certificate skips certificate validation. This can expose
connections to server impersonation, so for production use a certificate
trusted by the client and configure the connection to validate it instead.

If connection setup fails, check that:

- `SQL_SERVER` and `SQL_DATABASE` are correct and the database exists.
- The SQL Server service is running and TCP/IP is enabled for the instance.
- The Windows account running VS Code can connect to the database.
- The instance's TCP port is reachable; named instances may use dynamic ports.
- ODBC Driver 18 is installed and the server's certificate configuration is
  compatible with the TLS settings.

## Project layout

- `src/index.js` — MCP server, SQL connection configuration, and tool handlers.
- `.vscode/mcp.json` — Visual Studio Code MCP server configuration.
- `.github/agents/` — SQL Coordinator and specialist agent instructions.
