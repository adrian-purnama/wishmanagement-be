module.exports = {
  apps: [
    {
      name: "api",
      script: "./index.js",
      instances: 1,
      exec_mode: "fork",
    },
    {
      name: "worker",
      script: "./worker/matchworker.js",
      instances: 1,
      exec_mode: "fork",
    },
  ],
};