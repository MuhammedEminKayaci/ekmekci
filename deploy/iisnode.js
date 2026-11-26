// IIS + iisnode başlatıcısı. iisnode uygulamaya bir port numarası değil, bir named pipe
// verir (process.env.PORT = "\\.\pipe\…"); Next'in hazır server.js'i bunu sayıya çeviremediği
// için Next sunucusu burada doğrudan o kanalda dinletilir. Yapılandırma, derlemenin ürettiği
// .next/required-server-files.json'dan okunur.
const http = require("http");
const path = require("path");

process.env.NODE_ENV = "production";
const dir = __dirname;
process.chdir(dir);

const { config } = require(path.join(dir, ".next", "required-server-files.json"));
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);

const next = require("next");
const app = next({ dir, dev: false, conf: config, hostname: "localhost", port: 80 });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => handle(req, res));
    server.keepAliveTimeout = 65_000;
    server.listen(process.env.PORT || 3000, () => console.log(`Ekmekçi hazır: ${process.env.PORT || 3000}`));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
