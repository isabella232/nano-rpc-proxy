import {readTokenSettings, tokenLogSettings, TokenSettings} from "./token-settings";
import {log_levels, LogLevel, readConfigPathsFromENV} from "./common-settings";
import {Order, OrderDB} from "./lowdb-schema";
import { wallet } from "nanocurrency-web";
import * as Nano from 'nanocurrency'
import * as Tools from './tools'
import Nacl from 'tweetnacl/nacl'
import {
  CancelOrder,
  StatusCallback,
  TokenInfo, TokenPriceResponse,
  TokenResponse,
  TokenStatusResponse,
  WaitingTokenOrder,
  TokenRPCError,
} from "./node-api/token-api";

const API_TIMEOUT = 10000 // 10sec timeout for calling http APIs
const tokenSettings = readConfigPathsFromENV().token_settings
const settings: TokenSettings = readTokenSettings(tokenSettings)
tokenLogSettings(console.log, settings)

// ---
const sleep = (milliseconds: number) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

let node_url = "" // will be set by main script

// Functions to be required from another file
// Generates and provides a payment address while checking for receivable tx and collect them
export async function requestTokenPayment(token_amount: number, token_key: string, order_db: OrderDB, url: string): Promise<TokenRPCError | TokenInfo> {
  // Block request if amount is not within interval
  if (token_amount < settings.min_token_amount) {
    return {error: "Token amount must be larger than " + settings.min_token_amount}
  }
  if (token_amount > settings.max_token_amount) {
    return {error: "Token amount must be smaller than " + settings.max_token_amount}
  }

  node_url = url
  let priv_key = ""
  let address = ""
  let nano_amount = token_amount*settings.token_price // the Nano to be received

  // If token_key was passed it means refill tokens and update db order
  // first check if key exist in DB and the order is not currently processing
  if (token_key != "" && order_db.get('orders').find({token_key: token_key}).value()) {
    if (!order_db.get('orders').find({token_key: token_key}).value().order_waiting) {
      order_db.get('orders').find({token_key: token_key}).assign({"order_waiting":true, "nano_amount":nano_amount, "token_amount":0, "order_time_left":settings.payment_timeout, "processing":false, "timestamp":Math.floor(Date.now()/1000)}).write()
      address = order_db.get('orders').find({token_key: token_key}).value().address //reuse old address
    }
    else {
      return {error:"This order is already processing or was interrupted. Please try again later or request a new key."}
    }
  }
  // Store new order in db
  else {
    token_key = genSecureKey()
    let seed = genSecureKey().toUpperCase()
    let nanowallet = wallet.generate(seed)
    let accounts = wallet.accounts(nanowallet.seed, 0, 0)
    priv_key = accounts[0].privateKey
    let pub_key: string = Nano.derivePublicKey(priv_key)
    address = Nano.deriveAddress(pub_key, {useNanoPrefix: true})

    const order: Order = {"address":address, "token_key":token_key, "priv_key":priv_key, "tokens":0, "order_waiting":true, "nano_amount":nano_amount, "token_amount":0, "order_time_left":settings.payment_timeout, "processing":false, "timestamp":Math.floor(Date.now()/1000), "previous": null, "hashes": []}
    order_db.get("orders").push(order).write()
  }

  // Start checking for receivable and cancel order if taking too long
  logThis("Start checking receivable tx every " + settings.receivable_interval + "sec for a total of " + nano_amount + " Nano...", log_levels.info)
  checkReceivable(address, order_db)

  // Return payment request
  return { address: address, token_key:token_key, payment_amount:nano_amount }
}

export async function checkOrder(token_key: string, order_db: OrderDB): Promise<TokenRPCError | TokenResponse | WaitingTokenOrder> {
  // Get the right order based on token_key
  const order: Order | undefined = order_db.get('orders').find({token_key: token_key}).value()
  if (order) {
    if (!order.order_waiting && order.order_time_left > 0) {
      return { token_key: token_key, tokens_ordered: order.token_amount, tokens_total:order.tokens }
    }
    else if (order.order_time_left > 0){
      return {token_key:token_key, order_time_left: order.order_time_left}
    }
    else {
      return {error: "Order timed out for key: " + token_key}
    }
  }
  else {
    return {error: "Order not found for key: " + token_key}
  }
}
export async function cancelOrder(token_key: string, order_db: OrderDB): Promise<TokenRPCError | CancelOrder> {
  // Get the right order based on token_key
  const order: Order | undefined = order_db.get('orders').find({token_key: token_key}).value()
  if (order) {
    let previous_priv_key = order.priv_key
    let seed = genSecureKey().toUpperCase()
    let nanowallet = wallet.generate(seed)
    let accounts = wallet.accounts(nanowallet.seed, 0, 0)
    let priv_key = accounts[0].privateKey
    let pub_key: string = Nano.derivePublicKey(priv_key)
    let address: string = Nano.deriveAddress(pub_key, {useNanoPrefix: true})

    // Replace the address and private key and reset status
    if (!order.processing) {
      order_db.get('orders').find({token_key: token_key}).assign({"address":address, "priv_key":priv_key, "order_waiting":false, "nano_amount":0, "order_time_left":settings.payment_timeout, "processing":false, "timestamp":Math.floor(Date.now()/1000)}).write()
      logThis("Order was cancelled for " + token_key + ". Previous private key was " + previous_priv_key, log_levels.info)
      return {priv_key: previous_priv_key, status: "Order canceled and account replaced. You can use the private key to claim any leftover funds."}
    }
    else {
      logThis("Order tried to cancel but still in process: " + token_key, log_levels.info)
      return {priv_key: "",status: "Order is currently processing, please try again later."}
    }

  }
  else {
    return {error: "Order not found"}
  }
}
export async function checkTokens(token_key: string, order_db: OrderDB): Promise<TokenRPCError | TokenStatusResponse> {
  // Get the right order based on token_key
  const order = order_db.get('orders').find({token_key: token_key}).value()
  if (order) {
    if (order.order_waiting === false && order.order_time_left > 0) {
      return {tokens_total:order.tokens, status:"OK"}
    }
    else if (order.order_time_left > 0){
      return {tokens_total:order.tokens, status:'Something went wrong with the last order. You can try the buy command again with the same key to see if it register the receivable or you can cancel it and claim private key with "action":"tokenorder_cancel"'}
    }
    else {
      return {tokens_total:order.tokens, status:'The last order timed out. If you sent Nano you can try the buy command again with the same key to see if it register the receivable or you can cancel it and claim private key with "action":"tokenorder_cancel"'}
    }
  }
  else {
    return {error: "Tokens not found for that key"}
  }
}

export async function checkTokenPrice(): Promise<TokenPriceResponse> {
  return {token_price: settings.token_price}
}

export async function repairOrder(address: string, order_db: OrderDB, url: string): Promise<void> {
  node_url = url
  checkReceivable(address, order_db, false)
}

// Check if order payment has arrived as a receivable block, continue check at intervals until time is up. If continue is set to false it will only check one time
async function checkReceivable(address: string, order_db: OrderDB, moveOn: boolean = true, total_received = 0): Promise<void> {
  // Check receivable and claim
  let priv_key = order_db.get('orders').find({address: address}).value().priv_key
  let nano_amount = order_db.get('orders').find({address: address}).value().nano_amount
  order_db.get('orders').find({address: address}).assign({"processing":true}).write() // set processing status (to avoid stealing of the private key via orderCancel before receivable has been retrieved)
  try {
    let receivable_result: any = await processAccount(priv_key, order_db)
    order_db.get('orders').find({address: address}).assign({"processing":false}).write() // reset processing status

    // Payment is OK when combined receivable is equal or larger than was ordered (to make sure spammed receivable is not counted as an order)
    if('amount' in receivable_result && receivable_result.amount > 0) {
      total_received = total_received + receivable_result.amount
      // Get the right order based on address
      const order = order_db.get('orders').find({address: address}).value()
      if(total_received >= nano_amount-0.000001) { // add little margin here because of floating number precision deviation when adding many tx together
        let tokens_purchased = Math.round(total_received / settings.token_price)

        if (order) {
          // Save previous hashes to be appended with new discovered hashes
          let prev_hashes = []
          if ('hashes' in order && Array.isArray(order.hashes)) {
            prev_hashes = order.hashes
          }

          // Update the total tokens count, actual nano paid and receivable hashes that was processed
          logThis("Enough receivable amount detected: Order successfully updated! Continuing processing receivable internally", log_levels.info)
          order_db.get('orders').find({address: address}).assign({tokens: order.tokens + tokens_purchased, nano_amount: total_received, token_amount:order.token_amount + tokens_purchased, order_waiting: false, hashes:prev_hashes.concat(receivable_result.hashes)}).write()
          return
        }
        logThis("Address paid was not found in the DB", log_levels.warning)
        return
      }
      else {
        logThis("Still need " + (nano_amount - total_received)  + " Nano to finilize the order", log_levels.info)
        if (order) {
          // Save previous hashes to be appended with new discovered hashes
          let prev_hashes = []
          if ('hashes' in order && Array.isArray(order.hashes)) {
            prev_hashes = order.hashes
          }

          // Update the receivable hashes
          order_db.get('orders').find({address: address}).assign({hashes:prev_hashes.concat(receivable_result.hashes)}).write()
        }
      }
    }
    else if (!receivable_result?.amount) {
      logThis("Awaiting amount", log_levels.warning)
    }
  }
  catch(err) {
    logThis(err.toString(), log_levels.warning)
  }

  // If repairing accounts, only check one time and stop here
  if (!moveOn) {
    return
  }
  // pause x sec and check again
  await sleep(settings.receivable_interval * 1000)

  // Find the order and update the timeout key
  const order = order_db.get('orders').find({address: address}).value()
  if (order) {
    // Update the order time left
    let new_time = order.order_time_left - settings.receivable_interval
    if (new_time < 0) {
      new_time = 0
    }
    order_db.get('orders').find({address: address}).assign({order_time_left: new_time}).write()

    // continue checking as long as the db order has time left
    if (order.order_time_left > 0) {
      checkReceivable(address, order_db, true, total_received) // check again
    }
    else {
      order_db.get('orders').find({address: address}).assign({order_waiting: false}).write()
      logThis("Payment timed out for " + address, log_levels.info)
    }
    return
  }
  logThis("Address paid was not found in the DB", log_levels.warning)
  return
}


// Generate secure random 64 char hex
function genSecureKey(): string {
  const rand = Nacl.randomBytes(32)
  return rand.reduce((hex: string, idx: number) => hex + (`0${idx.toString(16)}`).slice(-2), '')
}

// Process an account
async function processAccount(privKey: string, order_db: OrderDB): Promise<StatusCallback> {
  let promise = new Promise(async (resolve: (value: StatusCallback) => void, reject: (reason?: any) => void) => {
    let pubKey: string = Nano.derivePublicKey(privKey)
    let address: string = Nano.deriveAddress(pubKey, {useNanoPrefix: true})

    // get account info required to build the block
    let command: any = {}
    command.action = 'account_info'
    command.account = address
    command.representative = true

    let balance: string = "0" // balance will be 0 if open block
    let adjustedBalance: string = balance.toString()
    let previous: string | null = null // previous is null if we create open block
    order_db.get('orders').find({priv_key: privKey}).assign({previous: previous}).write()
    let representative = 'nano_1iuz18n4g4wfp9gf7p1s8qkygxw7wx9qfjq6a9aq68uyrdnningdcjontgar'
    let subType = 'open'

    // retrive from RPC
    try {
      let data: AccountInfoResponse = await Tools.postData(command, node_url, API_TIMEOUT)
      let validResponse = false
      // if frontier is returned it means the account has been opened and we create a receive block
      if (data.frontier) {
        balance = data.balance
        adjustedBalance = balance
        previous = data.frontier
        order_db.get('orders').find({priv_key: privKey}).assign({previous: previous}).write()
        representative = data.representative
        subType = 'receive'
        validResponse = true
      }
      else if (data.error === "Account not found") {
        validResponse = true
        adjustedBalance = "0"
      }
      if (validResponse) {
        // create and publish all receivable
        createReceivableBlocks(order_db, privKey, address, balance, adjustedBalance, previous, subType, representative, pubKey, function(previous: string | null, newAdjustedBalance: string) {
          // the previous is the last received block and will be used to create the final send block
          if (parseInt(newAdjustedBalance) > 0) {
            processSend(order_db, privKey, previous, representative, () => {
              logThis("Done processing final send", log_levels.info)
            })
          }
          else {
            logThis("Balance is 0", log_levels.warning)
            resolve({'amount':0})
          }
        },
        // callback for status (accountCallback)
        (status: StatusCallback) => resolve(status))
      }
      else {
        logThis("Bad RPC response", log_levels.warning)
        reject(new Error('Bad RPC response'))
      }
    }
    catch (err) {
      logThis(err.toString(), log_levels.warning)
      reject(new Error('Connection error: ' + err))
    }
  })
  return await promise
}

// Create receivable blocks based on current balance and previous block (or start with an open block)
async function createReceivableBlocks(order_db: OrderDB, privKey: string, address: string, balance: string, adjustedBalance: string, previous: string | null, subType: string, representative: string, pubKey: string, callback: (previous: string | null, newAdjustedBalance: string) => any, accountCallback: (status: StatusCallback) => any): Promise<void> {
  // check for receivable first
  // Solving this with websocket subscription instead of checking receivable x times for each order would be nice but since we must check for previous receivable that was done before the order initated, it makes it very complicated without rewriting the whole thing..
  let command: any = {}
  command.action = 'receivable'
  command.account = address
  command.count = 10
  command.source = 'true'
  command.sorting = 'true' //largest amount first
  command.include_only_confirmed = 'true'
  command.threshold = settings.receivable_threshold

  // retrive from RPC
  try {
    let data: ReceivableResponse = await Tools.postData(command, node_url, API_TIMEOUT)
    // if there are any receivable, process them
    if (data.blocks) {
      // sum all raw amounts and create receive blocks for all receivable
      let raw = '0'
      let keys: string[] = []
      let blocks: any = {}
      const order = order_db.get('orders').find({address: address}).value()
      Object.keys(data.blocks).forEach(function(key) {
        let found = false
        // Check if the receivable hashes have not already been processed
        if (order && 'hashes' in order) {
          order.hashes.forEach(function(hash) {
            if (key === hash) {
              found = true
            }
          })
        }
        if (!found) {
          raw = Tools.bigAdd(raw,data.blocks[key].amount)
          keys.push(key)
          blocks[key] = data.blocks[key] // copy the original dictionary key and value to new dictionary
        }
      })
      // if no new receivable found, continue checking for receivable
      if (keys.length == 0) {
        accountCallback({'amount':0})
      }
      else {
        let nanoAmount = Tools.rawToMnano(raw)
        let row = "Found " + keys.length + " new receivable containing total " + nanoAmount + " NANO"
        logThis(row,log_levels.info)

        accountCallback({amount:parseFloat(nanoAmount), hashes: keys})

        // use previous from db instead for full compatability with multiple receivables
        previous = order.previous
        // If there is a previous in db it means there already has been an open block thus next block must be a receive
        if (previous != null) {
          subType = 'receive'
        }
        processReceivable(order_db, blocks, keys, 0, privKey, previous, subType, representative, pubKey, adjustedBalance, callback)
      }
    }
    else if (data.error) {
      logThis(data.error, log_levels.warning)
      accountCallback({ amount:0 })
    }
    // no receivable, create final block directly
    else {
      if (parseInt(adjustedBalance) > 0) {
        processSend(order_db, privKey, previous, representative, () => {
          accountCallback({amount: 0})
        })
      }
      else {
        accountCallback({amount: 0})
      }
    }
  }
  catch(err) {
    logThis(err, log_levels.warning)
  }
}

// For each receivable block: Create block, generate work and process
async function processReceivable(order_db: OrderDB, blocks: any, keys: any, keyCount: any, privKey: string, previous: string | null, subType: string, representative: string, pubKey: string, adjustedBalance: string, receivableCallback: (previous: string | null, newAdjustedBalance: string) => any): Promise<void> {
  let key = keys[keyCount]

  // generate local work
  try {
    let newAdjustedBalance: string = Tools.bigAdd(adjustedBalance,blocks[key].amount)
    logThis("Started generating PoW...", log_levels.info)

    // determine input work hash depending if open block or receive block
    let workInputHash = previous
    if (subType === 'open') {
      // input hash is the opening address public key
      workInputHash = pubKey
    }

    let command: any = {}
    command.action = "work_generate"
    command.hash = workInputHash
    command.multiplier = settings.difficulty_multiplier
    command.use_peers = "true"

    // retrive from RPC
    try {
      let data: WorkGenerateResponse = await Tools.postData(command, settings.work_server, API_TIMEOUT)
      if (data.work) {
        let work = data.work
        // create the block with the work found
        let block: Nano.Block = Nano.createBlock(privKey,{balance:newAdjustedBalance, representative:representative,
        work:work, link:key, previous:previous})
        // replace xrb with nano (old library)
        block.block.account = block.block.account.replace('xrb', 'nano')
        block.block.link_as_account = block.block.link_as_account.replace('xrb', 'nano')
        // new previous
        previous = block.hash

        // publish block for each iteration
        let jsonBlock = {action: "process",  json_block: "true",  subtype:subType, watch_work:"false", block: block.block}
        subType = 'receive' // only the first block can be an open block, reset for next loop

        try {
          let data: ProcessResponse = await Tools.postData(jsonBlock, node_url, API_TIMEOUT)
          if (data.hash) {
            logThis("Processed receivable: " + data.hash, log_levels.info)

            // update db with latest previous (must use this if final block was sent before the next receivable could be processed in the same account, in the rare event of multiple receivable)
            order_db.get('orders').find({priv_key: privKey}).assign({previous: previous}).write()

            // continue with the next receivable
            keyCount += 1
            if (keyCount < keys.length) {
              processReceivable(order_db, blocks, keys, keyCount, privKey, previous, subType, representative, pubKey, newAdjustedBalance, receivableCallback)
            }
            // all receivable done, now we process the final send block
            else {
              logThis("All receivable processed!", log_levels.info)
              receivableCallback(previous, newAdjustedBalance)
            }
          }
          else {
            logThis("Failed processing block: " + data.error, log_levels.warning)
          }
        }
        catch(err) {
          logThis(err, log_levels.warning)
        }
      }
      else {
        logThis("Bad PoW result", log_levels.warning)
      }
    }
    catch(err) {
      logThis(err, log_levels.warning)
    }
  }
  catch(error) {
    if(error.message === 'invalid_hash') {
      logThis("Block hash must be 64 character hex string", log_levels.warning)
    }
    else {
      logThis("An unknown error occurred while generating PoW" + error, log_levels.warning)
    }
    return
  }
}

// Process final send block to payment destination
async function processSend(order_db: OrderDB, privKey: string, previous: string | null, representative: string, sendCallback: () => void): Promise<void> {
  let pubKey = Nano.derivePublicKey(privKey)
  let address = Nano.deriveAddress(pubKey, {useNanoPrefix: true})

  logThis("Final transfer started for: " + address, log_levels.info)
  let command: any = {}
  command.action = 'work_generate'
  command.hash = previous
  command.multiplier = settings.difficulty_multiplier
  command.use_peers = "true"

  // retrive from RPC
  try {
    let data: WorkGenerateResponse = await Tools.postData(command, settings.work_server, API_TIMEOUT)
    if (data.work) {
      let work = data.work
      // create the block with the work found
      let block = Nano.createBlock(privKey, {balance:'0', representative:representative,
      work:work, link:settings.payment_receive_account, previous:previous})
      // replace xrb with nano (old library)
      block.block.account = block.block.account.replace('xrb', 'nano')
      block.block.link_as_account = block.block.link_as_account.replace('xrb', 'nano')

      // publish block for each iteration
      let jsonBlock = {action: "process",  json_block: "true",  subtype:"send", watch_work:"false", block: block.block}
      try {
        let data: ProcessResponse = await Tools.postData(jsonBlock, node_url, API_TIMEOUT)
        if (data.hash) {
          logThis("Funds transferred at block: " + data.hash + " to " + settings.payment_receive_account, log_levels.info)
          // update the db with latest hash to be used if processing receivable for the same account
          order_db.get('orders').find({priv_key: privKey}).assign({previous: data.hash}).write()
        }
        else {
          logThis("Failed processing block: " + data.error, log_levels.warning)
        }
        sendCallback()
      }
      catch(err) {
        logThis(err, log_levels.warning)
      }
    }
    else {
      logThis("Bad PoW result", log_levels.warning)
    }
  }
  catch(err) {
    logThis(err, log_levels.warning)
    sendCallback()
  }
}

// Log function
function logThis(str: string, level: LogLevel) {
  if (settings.log_level == log_levels.info || level == settings.log_level) {
    if (level == log_levels.info) {
      console.info(str)
    }
    else {
      console.warn(str)
    }
  }
}
