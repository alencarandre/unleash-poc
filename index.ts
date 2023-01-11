import { Axios } from "axios";
import { initialize, Unleash } from "unleash-client";
import { green, red, yellow } from "colors/safe";

const featureToggle = "unleash-poc-toggle-enabled";
const adminApiKey = "*:*.admin-api-token";
const clientApiKey = "default:development.client-api-token";
const environment = "development";
const projectName = "default";

const httpService = new Axios({
  url: "http://localhost:4242",
  headers: {
    Authorization: "*:*.admin-api-token",
    "Content-Type": "application/json",
  },
});

let userId: string | undefined = undefined;
let unleash: Unleash;

function nextUser(userId: string | undefined): string | undefined {
  if (userId == undefined) {
    return "123";
  } else if (userId == "123") {
    return "456";
  } else if (userId == "456") {
    return "789";
  } else {
    return undefined;
  }
}

function howIsToggle() {
  const enabled = green("enabled");
  const disabled = red("disabled");

  if (userId)
    return unleash.isEnabled(featureToggle, { userId }) ? enabled : disabled;
  else return unleash.isEnabled(featureToggle) ? enabled : disabled;
}

function createToggle() {
  return httpService
    .post(
      "http://localhost:4242/api/admin/projects/${projectName}/features",
      JSON.stringify({
        name: featureToggle,
      }),
      {
        headers: {
          Authorization: adminApiKey,
          "Content-Type": "application/json",
        },
      }
    )
    .catch((e) => console.error("error", e));
}

async function sleep(time: number) {
  await new Promise((resolve) => setTimeout(resolve, time));
}

function enableToggle() {
  return httpService.post(
    `http://localhost:4242/api/admin/projects/${projectName}/features/${featureToggle}/environments/${environment}/on`,
    undefined,
    {
      headers: {
        Authorization: adminApiKey,
        "Content-Type": "application/json",
      },
    }
  );
}

async function getToggle() {
  const { data: toggle } = await httpService.get(
    `http://localhost:4242/api/admin/projects/${projectName}/features/${featureToggle}/environments/development`,
    {
      headers: {
        Authorization: adminApiKey,
        "Content-Type": "application/json",
      },
    }
  );

  return JSON.parse(toggle);
}

async function getStrategies() {
  const toggle = await getToggle();

  return toggle.strategies;
}

async function deleteStrategyById(strategyId: string) {
  return httpService.delete(
    `http://localhost:4242/api/admin/projects/${projectName}/features/${featureToggle}/environments/${environment}/strategies/${strategyId}`,
    {
      headers: {
        Authorization: adminApiKey,
        "Content-Type": "application/json",
      },
    }
  );
}

async function addStrategy(userId?: string[]) {
  await sleep(100);
  const data = {
    name: userId ? "userWithId" : "default", // strategy template name
    constraints: [],
    parameters: userId
      ? {
          userIds: userId?.join(","),
        }
      : {},
  };

  await httpService.post(
    `http://localhost:4242/api/admin/projects/${projectName}/features/${featureToggle}/environments/${environment}/strategies`,
    JSON.stringify(data),
    {
      headers: {
        Authorization: adminApiKey,
        "Content-Type": "application/json",
      },
    }
  );
  // await enableToggle();
}

async function deleteStrategyByName(strategyName: string) {
  const strategies = await getStrategies();

  const strategyId = strategies.find(
    (s: any) => s.strategyName == strategyName
  )?.id;

  if (strategyId) await deleteStrategyById(strategyId);
}

async function clearStrategies() {
  const strategies = await getStrategies();

  if (strategies) {
    await Promise.all(strategies.map(({ id }: any) => deleteStrategyById(id)));
  }
}

async function startPolling() {
  let i = 0;
  let currentAllowUser: string | undefined;

  await sleep(1_000);
  setInterval(() => {
    i++;
    console.log(
      yellow(String(i).padStart(2, "0")),
      `Toggle ${howIsToggle()}`,
      userId
        ? {
            userId,
          }
        : ""
    );
  }, 1_000);

  setInterval(() => {
    userId = nextUser(userId);
  }, 3_000);

  setInterval(async () => {
    i = 0;
    currentAllowUser = nextUser(currentAllowUser);

    if (!currentAllowUser) {
      console.log("\n.. Enable for all\n");
    } else {
      console.log(`\n.. Add user ${currentAllowUser} to enabled list\n`);
    }

    if (!currentAllowUser) {
      await clearStrategies();
      await addStrategy();
      await enableToggle();
    } else {
      await addStrategy([currentAllowUser]);
      await deleteStrategyByName("default");
    }
  }, 15_000);
}

Promise.resolve()
  .then(() => createToggle())
  .then(() => clearStrategies())
  .then(() => addStrategy())
  .then(() => enableToggle())
  .then(() => sleep(1_000))
  .then(
    () =>
      (unleash = initialize({
        url: "http://localhost:4242/api",
        appName: "unleash-poc",
        environment,
        projectName,
        customHeaders: { Authorization: clientApiKey },
        refreshInterval: 5,
        bootstrap: {
          // data,
          url: "http://localhost:4242/api/client/features",
          urlHeaders: {
            Authorization: clientApiKey,
            "Content-Type": "application/json",
          },
        },
      }))
        .on("ready", () => startPolling())
        .on("error", console.error)
        .on("warn", console.warn)
        .on("changed", () => {
          console.log(`\nToggle was ${howIsToggle()} for user ${userId}\n`);
        })
    // .on("count", (name, enabled) =>
    //   console.log(`isEnabled(${name})`, enabled)
    // )
  )
  .catch((error) => console.error("the error:", error));
