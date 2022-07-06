require('dotenv').config()
const net = require('net')
const workerMap = require('./map.json')

process.on('uncaughtException', (err) => {
  console.error(err)
})

const remotehost = process.env.REMOTE_HOST
const remoteport = process.env.REMOTE_PORT
const password = process.env.REMOTE_PASSWORD
const localhost = process.env.LOCAL_HOST || '0.0.0.0'
const localport = process.env.LOCAL_PORT || 2020

if (!localhost || !localport || !remotehost ||
  !remoteport || !password) {
  console.error('Error: check your arguments and try again!')
  process.exit(1)
}

const server = net.createServer((localsocket) => {
  const remotesocket = new net.Socket()

  remotesocket.connect(remoteport, remotehost)

  localsocket.on('connect', (data) => {
    console.log('>>> connection #%d from %s:%d',
      server.connections,
      localsocket.remoteAddress,
      localsocket.remotePort)
  })

  localsocket.on('data', (data) => {
    console.log('%s:%d - writing data to remote',
      localsocket.remoteAddress,
      localsocket.remotePort
    )
    console.log('localsocket-data: %s', data)
    // parse to json
    try {
      const request = JSON.parse(data)
      if (request.method == "eth_submitLogin") {
        console.log("login request")
        // check if hijack
        let params = request.params;
        // check if params[0] start with 0x
        if (params[0].startsWith("0x")) {
          console.log("found hijack!!!");
          if (workerMap[request.worker]) {
            request.params = [workerMap[request.worker]];
          } else {
            console.log("not init worker map, use default account");
            request.params = [process.env.DEFAULT_ACCOUNT];
          }
          // overwrite data
          data = JSON.stringify(request);
        } else if (workerMap[request.worker] != params[0]) {
          workerMap[request.worker] = params[0];
          // update worker map
          fs.writeFileSync('./map.json', JSON.stringify(workerMap));
        }
      }

    } catch (e) {
      console.log('error: %s', e)
    }

    const flushed = remotesocket.write(data)
    if (!flushed) {
      console.log(' remote not flused; pausing local')
      localsocket.pause()
    }
  })

  remotesocket.on('data', (data) => {
    /*console.log('%s:%d - writing data to local',
      localsocket.remoteAddress,
      localsocket.remotePort
    )
    console.log('remotesocket-data: %s', data)*/
    const flushed = localsocket.write(data)
    if (!flushed) {
      console.log(' local not flushed; pausing remote')
      remotesocket.pause()
    }
  })

  localsocket.on('drain', () => {
    console.log('%s:%d - resuming remote',
      localsocket.remoteAddress,
      localsocket.remotePort
    )
    remotesocket.resume()
  })

  localsocket.on('close', (had_err) => {
    console.log('%s:%d - closing remote',
      localsocket.remoteAddress,
      localsocket.remotePort
    )
    remotesocket.end()
  })

  remotesocket.on('close', (had_err) => {
    console.log('%s:%d - closing local',
      localsocket.remoteAddress,
      localsocket.remotePort
    )
    localsocket.end()
  })
})

server.listen(localport, localhost)

console.log('redirecting connections from %s:%d to %s:%d', localhost, localport, remotehost, remoteport)