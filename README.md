# NanoRPCProxy
NanoRPCProxy is a relay and protection system that sits between a client and a Nano node RPC interface. It makes it possible to set the RPC interface public to the Internet without compromising the security of the node itself. The Nano node has NO built in functionality for user authentication, rate limiting or caching which makes it dangerous to open up without protection like this proxy provides. With NanoRPCProxy you can for example serve a mobile app or web frontend with indirect node calls.

**In reality, it can be used for Nano wallets, exchanges, block explorers, public APIs, monitor systems, Point of Sale or anything that communicates with a node.**

The built in token system makes it possible to serve requests beyond the default limits and monetize your backend via direct Nano token purchases.

Demo clients/code for Curl, JS, REACT, Python and Flask are available to test your own server.

**A public demo client with token purchases and API support for the the live Nano network is available [here](https://example.com)!**


## Features
* Fully customizable via a settings file
* Caching of certain request actions to lower the RPC burden
* Limits number of response objects, like number of pending transactions
* Slows down IPs that doing requests above limit (Including purchased tokens)
* Blocks IPs for a certain amount of time that are doing requests above limit (Overridden by purchased tokens)
* IP black list (Overrides purchased tokens)
* Supports basic authentication (username / password)
* Supports multiple users via authentication
* User specific settings override
* Optional token system for requests with built-in Nano purchases => independent of any 3rd party payment processors => unlimited implementation possibilities
* Supports POST requests like the RPC, ie. payload = {"action":"block_count"}
* Supports GET requests, ie. URL query = /proxy/?action=block_count
* Listens on http and/or https with your own SSL cert (or use another proxy like Cloudflare to serve https)
* Works with both beta and main Nano network
* Demo clients/code
* 100% free to use, develop or sell with MIT license

**Possible use cases**
![NanoRPCProxy](https://github.com/Joohansson/NanoRPCProxy/raw/master/media/NanoRPCPRoxy.png)


## Index

* [Install and run the proxy server](#install-and-run-the-proxy-server)
* [How to customize the proxy server](#how-to-customize-the-proxy-server)
* [How to use the proxy server](#how-to-use-the-proxy-server)
* [How to install and test the demo clients](#how-to-install-and-test-the-demo-clients)
* [Developer Donations](#developer-donations)


## Install and run the proxy server
### Setup nodejs and test server
1. Make sure you have node.js installed. [Windows Guide](https://www.liquidweb.com/kb/install-react-js-windows/) | [Ubuntu Guide](https://medium.com/@DanielSayidi/install-and-setup-react-app-on-ubuntu-18-04-3-lts-fcd2c875885a)
2. Locate the directory srs/server
3. Copy the default setting files to your own editable ones:

These will not be affected if later updating the server via git pull

    cp creds.json.default creds.json
    cp settings.json.default settings.json
    cp user_settings.json.default user_settings.json
    cp token_settings.json.default token_settings.json

4. Install required libraries: **npm install**
5. Start and test the server: **node proxy.js**

### Option1: Install as a service using PM2 (Recommended)
https://pm2.keymetrics.io/docs/usage/quick-start/

1. Locate the directory srs/server
2. Install pm2: **npm install pm2@latest -g**
3. Start the server: **pm2 start proxy.js**

#### Other useful pm2 commands
* pm2 restart proxy.js, **pm2 stop proxy.js, pm2 delete proxy.js**
* Make pm2 auto-boot at server restart: **pm2 startup**
* Realtime online monitor: **pm2 monitor**
* Status: **pm2 status**
* Realtime logs: **pm2 logs** (or specifically for this app: **pm2 logs proxy.js**)
* Terminal dashboard: **pm2 monit**

Before making changes, stop any running servers with "pm2 stop proxy.js" and delete the process with "pm delete proxy.js"
* Specify log location: **pm2 start proxy.js --log ~/NanoRPCProxy.log**
* Restart app when file changes: **pm2 start proxy.js --watch**

#### Update pm2:
1. npm install pm2@latest -g
2. pm2 update

Example of PM2 web monitor. Can track all your apps and with realtime logs.
![PM2 Web Monitor](https://github.com/Joohansson/NanoRPCProxy/raw/master/media/pm2_monitor.png)

### Option2: Install as a service using systemd on Linux
https://expeditedsecurity.com/blog/deploy-node-on-linux/#node-linux-service-systemd

1. Create a file /etc/systemd/system/nanorpcproxy.service
2. Paste this

**change to your actual location of proxy.js**

    [Unit]
    Description=NanoRPCProxy
    After=network.target

    [Service]
    ExecStart=/usr/local/bin/node /home/NanoRPCProxy/src/server/proxy.js
    Restart=always
    RestartSec=10 #wait 10sec before restart
    #User=nobody
    #Group=nogroup
    Environment=PATH=/usr/bin:/usr/local/bin
    Environment=NODE_ENV=production
    WorkingDirectory=/home/NanoRPCProxy/src/server/

    [Install]
    WantedBy=multi-user.target

3. Make the file executable: **sudo chmod +x /home/NanoRPCProxy/src/server/proxy.js**
4. Make systemd aware: **sudo systemctl daemon-reload**
5. Test the service: **sudo systemctl start nanorpcproxy**
6. Check status: **sudo systemctl status nanorpcproxy**
7. Start service on boot: **sudo systemctl enable nanorpcproxy.service**
8. Follow logs in realtime: **sudo journalctl --follow -u nanorpcproxy**

### Updating the server
1. Go to the root folder -> git pull
2. Go to srs/server -> npm install
3. Restart the proxy.js

It may happen that the settings files are expanded. In that case, you need to do this again in order for the new variables to be modified by you (or insert them manually). Save your old settings first!

    cp settings.json.default settings.json
    cp user_settings.json.default user_settings.json
    cp token_settings.json.default token_settings.json

## How to customize the proxy server
The proxy server is configured via the **settings.json** file found in the server folder

* **node_url:** Nano node RPC url (default for main network is 'http://[::1]:7076' and for beta network 'http://[::1]:55000') [number]
* **http_port:** Port to listen on for http (enabled default with the setting <use_http>) [number]
* **https_port:** Port to listen on for https (disabled default with the setting <use_https>) [number]
* **use_auth:** If require username and password when connecting to the proxy. Defined in **creds.json** [true/false]
* **use_speed_limiter:** If slowing down IPs when they request above set limit (defined in <speed_limiter>) [true/false]
* **use_ip_block:** If blocking IPs for a certain amount of time when they request above set limit (defined in <ip_block>) [true/false]
* **use_cache:** If caching certain commands set in <cached_commands> [true/false]
* **use_http:** Listen on http [true/false]
* **use_https:** Listen on https (a valid cert and key file is needed via <https_cert> and <https_key>) [true/false]
* **use_output_limiter:** If limiting number of response objects, like pending transactions, to a certain max amount set in <limited_commands>. Only valid for RPC actions that have a "count" key [true/false] [true/false]
* **use_ip_blacklist:** If always blocking certain IPs set in <ip_blacklist> [true/false]
* **use_tokens** If activating the token system for purchase via Nano [true/false] (more information further down)
* **https_cert:** File path for pub cert file [absolute path string]
* **https_key:** File path for private key file [absolute path string]
* **allowed_commands:** A list of RPC actions to allow [list]
* **cached_commands:** A list of commands [key] that will be cached for corresponding duration in seconds as [value]
* **limited_commands:** A list of commands [key] to limit the output response for with max count as [value]
* **ip_blacklist:** A list of IPs to always block. If calling from localhost you can test this with 127.0.0.1 (::ffff:127.0.0.1 for ipv6)
* **speed_limiter:** Contains the settings for slowing down clients. The rolling time slot is defined with <time_window> [ms]. When number of requests in that slot is exceeding <request_limit> it will start slowing down requests with increments of <delay_increment> [ms] with a maximum total delay defined in <max_delay> [ms]
* **ip_block:** Contains the settings for blocking IPs when they request too much. The rolling time slot is defined with <time_window> [ms]. When number of requests in that slot is exceeding <request_limit> it will block the IP until the time slot has passed. Then the IP can start requesting again. To permanently ban IPs they have to be manually added to <ip_blacklist> and activating <use_ip_blacklist>. The token system is disabled by default.
* **proxy_hops** If the NanoRPCProxy is behind other proxies such as apache or cloudflare the source IP will be wrongly detected and the filters will not work as intended. Enter the number of additional proxies here. Example: api.example.com is proxied through Cloudflare to IP 1.1.1.1 and then local Nginx server is proxying api.example.com to localhost:9950. Proxyhops will be 2.
* **log_level:** It can be set to either "info" which will output all logs, "warning" which will only output warning messages or "none" which will only log the initial settings.

The following parameters can be set in **user_settings.json** to override the default ones for specific users defined in **creds.json**. Anything in this file will override even if there are less sub entries like only 1 allowed command or 2 limited commands.

* **use_cache**
* **use_output_limiter**
* **allowed_commands**
* **cached_commands**
* **limited_commands**
* **log_level**

The following parameters can be set in **token_settings.json** for configuration of the token system. The system require the <use_tokens> to be active in **settings.json**
More info about [The Token System](#the-token-system).

* **work_server** Source for calculating PoW. Can be a node (http://[::1]:7076) (with enable_control active) or a [work server](https://github.com/nanocurrency/nano-work-server) which can be run as "./nano-work-server --gpu 0:0 -l 127.0.0.1:7000" and then set work_server to http://127.0.0.1:7000. Also available pre-compiled [here](https://github.com/guilhermelawless/nano-dpow/tree/master/client).
* **token_price**: Purchase price per token [Nano]
* **payment_timeout**: Payment window before timeout and cancelled [seconds]
* **pending_interval**: How often to check for deposit during the payment window (may be removed if websocket is implemented)
* **pending_threshold**: Skip processing pending transactions below this raw amount
* **pending_count**: The maximum number of pending transactions to process each time a new order comes in
* **difficulty_multiplier**: The PoW multiplier from base difficulty (may be needed during network saturation)
* **payment_receive_account**: The account to send the incoming money
* **min_token_amount**: The minimum amount of tokens to allow for purchase
* **max_token_amount**: The maximum amount of tokens to allow for purchase
* **log_level**: It can be set to either "info" which will output all logs, "warning" which will only output warning messages or "none" which will only log the initial settings.


**The effect of the settings**
![Protection System](https://github.com/Joohansson/NanoRPCProxy/raw/master/media/NanoRPCProxy_limiter.png)


## How to use the proxy server
You call the proxy server just like you would call the node RPC. It's a normal POST request to "/proxy" with json formatted data.
The node commands are found here: https://docs.nano.org/commands/rpc-protocol/

It also support URL queries via GET request, which means you can even run the commands from a web browser via links such as "/proxy/?action=block_count" and get a json response.
However, if authentication is activated in the server settings, basic auth headers are needed so that won't work in a browser.

### Special RPC commands
The proxy server also support special commands not supported in the Nano RPC. They need to be listed in the **settings.json** under "allowed_commands"
* **{"action":"price"}** Returns the latest Nano price quote from Coinpaprika. Will always be cached for 10sec.

### Using curl
The curl command looks just a tiny bit different than for a direct node request. You just have to define it with a json content type. You can also use the -i flag to include response headers.

**POST: No authentication**

    curl -H "Content-Type: application/json" -d '{"action":"block_count"}' http://localhost:9950/proxy

**POST: With authentication**

    curl --user user1:user1 -H "Content-Type: application/json" -d '{"action":"block_count"}' http://127.0.0.1:9950/proxy

**GET: No authentication**

    curl http://localhost:9950/proxy?action=block_count

**GET: With authentication**

    curl --user user1:user1 http://localhost:9950/proxy?action=block_count

![Curl demo](https://github.com/Joohansson/NanoRPCProxy/raw/master/media/demo_curl.png)

### Using python
**POST: No authentication**

    import requests
    import json
    try:
        r = requests.post("http://localhost:9950/proxy", json={"action":"block_count"})
        status = r.status_code
        print("Status code: ", status)
        if (status == 200):
            print("Success!")
        try:
            print(r.json())
        except:
            print(r)
    except Exception as e:
        print("Fatal error", e)

**POST: With authentication**
Note: verify=False means we ignore possible SSL certificate errors. Recommended to set to True

    r = requests.post('http://localhost:9950/proxy', json={"action":"block_count"}, verify=False, auth=HTTPBasicAuth(username, password))

**GET: With authentication**

    r = requests.get('http://localhost:9950/proxy?action=block_count', auth=HTTPBasicAuth(username, password))

### Using JS
**POST: Async with authentication (Without: remove the Authorization header)**

See the js demo client for full example with error handling

    For html file: <script src="https://cdn.jsdelivr.net/npm/js-base64@2.5.2/base64.min.js"></script>

    async function postData(data = {}, server='http://localhost:9950/proxy') {
      const response = await fetch(server, {
        method: 'POST',
        cache: 'no-cache',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Base64.encode('user1:user1')
        },
        body: JSON.stringify(data)
      })
      return await response.json()
    }

    postData({"action":"block_count"})
    .then((data) => {
      console.log(JSON.stringify(data, null, 2))
    })
    .catch(function(error) {
      console.log(error)
    })

**GET: No authentication using jquery**

    $.get("http://localhost:9950/proxy?action=block_count", function(data, status){
      console.log(data)
    })

**GET: Authentication using jquery and ajax**

    $.ajax({
         url: "http://localhost:9950/proxy?action=block_count",
         type: "GET",
         beforeSend: function(xhr){xhr.setRequestHeader('Authorization', 'Basic ' + Base64.encode('user1:user1'))},
         success: function(data, status) {console.log(data)}
      })

### The Token System
Only a certain amount of requests per time period is allowed and configured in the settings. Users who need more requests (however still affected by the "slow down rate limiter") can purchase tokens with Nano. The system requires the <use_tokens> to be active in **settings.json**.

![Token System](https://github.com/Joohansson/NanoRPCProxy/raw/master/media/NanoRPCPRoxy_tokens.png)

#### Available Commands

* **{"action":"block_count","token_key":"815c8c736756da0965ca0994e9ac59a0da7f635aa0675184eff96a3146c49d74"}**

Any RPC command can be made by including a request key. For each request 1 token will be deducted and the total left will be included in each response as tokens_total.

    {
      "count": "24613996",
      "unchecked": "0",
      "cemented": "24613996",
      "tokens_total": 4999
    }

* **{"action":"tokens_buy","token_amount":10}**

Initiates a new order of 10 tokens and respond with a deposit account, a token key and the amount of Nano to pay

    {
      "address": "nano_3m497b1ghppe316aiu4o5eednfyueemzjf7a8wye3gi5rjrkpk1p59okghwb",
      "token_key": "815c8c736756da0965ca0994e9ac59a0da7f635aa0675184eff96a3146c49d74",
      "payment_amount": 0.001
    }

* **{"action":"tokens_buy","token_amount":10,"token_key":"815c8c736756da0965ca0994e9ac59a0da7f635aa0675184eff96a3146c49d74"}**

Initiates a refill order of existing key for 10 tokens

    {
      "address": "nano_3m497b1ghppe316aiu4o5eednfyueemzjf7a8wye3gi5rjrkpk1p59okghwb",
      "token_key": "815c8c736756da0965ca0994e9ac59a0da7f635aa0675184eff96a3146c49d74",
      "payment_amount": 0.001
    }

* **{"action":"tokenorder_check","token_key":"815c8c736756da0965ca0994e9ac59a0da7f635aa0675184eff96a3146c49d74"}**

Check status of initiated order. Either the time left to pay the order:

    {
      "order_time_left": 135
    }

Or status:

    {
      "error": "Order timed out"
    }

Or final tokens bought based on the amount paid:

    {
      "tokens_ordered": 1000,
      "tokens_total": 2000
    }

* **{"action":"tokenorder_cancel","token_key":"815c8c736756da0965ca0994e9ac59a0da7f635aa0675184eff96a3146c49d74"}**

Reset the deposit account and return last private key to be used for recovery

    {
      "priv_key": "2aad399e19f926c7358a2d21d3c320e32bfedb774e0a43dba684853a1ca2cf56",
      "status": "Order canceled and account replaced. You can use the private key to claim any leftover funds."
    }

* **{"action":"tokens_check","token_key":"815c8c736756da0965ca0994e9ac59a0da7f635aa0675184eff96a3146c49d74"}**

Returns the total amount of tokens bound to the key and status of last order

    {
      "tokens_total": 10,
      "status": "OK"
    }

* **{"action":"tokenprice_check"}**

Returns the current price set by the server

    {
      "token_price": 0.0001
    }

Demo of purchasing tokens using the React demo client:
![React demo app - Token purchase](https://github.com/Joohansson/NanoRPCProxy/raw/master/media/client_demo_react_02.png)

Order completed:
![React demo app - Token purchase complete](https://github.com/Joohansson/NanoRPCProxy/raw/master/media/client_demo_react_03.png)

### Error handling
If error or warnings occurs in the server when calling it the client will need to handle that. The response is (along with a http status code != 200):

    {"error": "The error message"}

### Logging and Stats
The server will write a standard log depending on the "log_level" in settings.json and token_settings.json. Additionally, a request-stat.log is written in the server dir every day at midnight with a daily request count and timestamp.


## How to install and test the demo clients
The proxy server can be tested and experimented with using provided demo clients. They can also help you getting starting with your own setup.

### Python client
1. Locate the directory demo_clients/python/
2. If you haven't, install pipenv to run the app in a virtual environment: **pip install pipenv** for Linux or **py -m pip install --user pipenv** for Windows. To call "pipenv" in Windows instead of "py -m pipenv" you can add the python script folder (provided by the installation log) to your environment PATH.
3. Start the environment: **pipenv shell**
4. Install the packages required: **pipenv sync**
5. Test a request with "python client.py --c 1" where 1 means command example 1. Run "python client.py --help" to find out more. In windows you use "py client.py".
6. To test a server that is using authentication: "python client.py --c 1 --a"

Exit pipenv: **exit**

![Python demo app](https://github.com/Joohansson/NanoRPCProxy/raw/master/media/client_demo_python.png)

### JS client
1. Locate the directory demo_clients/js
2. Open index.html in a browser

Note: The credentials for authentication is hard coded in the javascript and to my knowledge it's not possible to hide. However, the reactjs client is compiled and thus have the creds hidden inside the app. As far as I know, that should be safe as long as the source code cred file is not shared publicly.

![JS demo app](https://github.com/Joohansson/NanoRPCProxy/raw/master/media/client_demo_js.png)

### REACT client
The only demo client that has full functionality for purchasing request tokens

**To run the pre-built app:**

1. Locate the directory demo_clients/reactjs/build
2. Open index.html in a browser (Chrome/Firefox recommended)
3. If you change the user credentials in the server <creds.json> you will also need to change the reactjs/src/rpc.js credentials and re-build the app from source (instructions below). Don't share your creds file if you are going to make it live!

![React demo app](https://github.com/Joohansson/NanoRPCProxy/raw/master/media/client_demo_react_01.png)

**To run or build the app from source**

1. Make sure you have node.js (and react) installed. [Windows Guide](https://www.liquidweb.com/kb/install-react-js-windows/) | [Ubuntu Guide](https://medium.com/@DanielSayidi/install-and-setup-react-app-on-ubuntu-18-04-3-lts-fcd2c875885a)
2. Locate the directory demo_clients/reactjs
3. Install required libraries: "npm install" or "yarn install"
3. Test the app in development mode: "npm start" or "yarn start"
4. Navigate to http://localhost:3000/
5. To build from source: "npm run-script build"
6. The final build is located in clients/reactjs/build

### Flask client
1. Locate the directory demo_clients/python/
2. If you haven't, install pipenv to run the app in a virtual environment: **pip install pipenv** for Linux or **py -m pip install --user pipenv** for Windows. To call "pipenv" in Windows instead of "py -m pipenv" you can add the python script folder (provided by the installation log) to your environment PATH.
3. Start the environment: **pipenv shell**
4. Install the packages required: **pipenv sync**
5. Test the app: **python client.py** (In windows you use "py client.py")
6. Open in browser: **http://127.0.0.1:5000/** (If site not reachable in Windows, you may have to disable third party firewall)

Exit pipenv: **exit**

![Flask demo app](https://github.com/Joohansson/NanoRPCProxy/raw/master/media/client_demo_js.png)


## Developer Donations
Find this useful? Consider sending me a Nano donation at nano_1gur37mt5cawjg5844bmpg8upo4hbgnbbuwcerdobqoeny4ewoqshowfakfo

Discord support server: https://discord.gg/RVCuFvc
