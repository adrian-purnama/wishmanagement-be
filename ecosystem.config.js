export default {
  apps: [
    {
      name: "main-app",
      script: "./index.js",
    },
    {
      name: "match-worker",
      script: "./worker/matchWorker.js",
    },
  ],
};