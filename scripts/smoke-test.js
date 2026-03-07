const { createAppServer } = require("../server");

async function run() {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, resolve));

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
    const leaderboards = await fetch(`${baseUrl}/api/leaderboards`).then((response) => response.json());

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ngo@carebridge.demo", password: "demo12345" })
    });
    const loginPayload = await loginResponse.json();
    const cookie = loginResponse.headers.get("set-cookie");

    const itemsResponse = await fetch(`${baseUrl}/api/items?audience=ngo`, {
      headers: { cookie }
    });
    const itemsPayload = await itemsResponse.json();

    process.stdout.write(
      `${JSON.stringify({
        healthOk: health.ok,
        providerLeaderboard: leaderboards.providerLeaderboard.length,
        loggedInRole: loginPayload.user.role,
        ngoDiscoverableItems: itemsPayload.items.length
      })}\n`
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
