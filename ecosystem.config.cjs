module.exports = {
  apps: [
    {
      name: "api",
      script: "./index.js",
      interpreter: "node", 
      exec_mode: "fork",
    },
    {
      name: "worker",
      script: "./worker/matchWorker.js",
      interpreter: "node",
      exec_mode: "fork",
    },
  ],
};
