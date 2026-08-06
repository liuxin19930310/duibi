// src/ospf.js
// OSPF 邻接状态解析：从运行态 `display ospf peer brief`(OSPFv2) 与
// `display ospfv3 peer`(OSPFv3) 提取邻接信息；并关联配置块里 `ospf N vpn-instance XXX`
// 得到每个进程所属的 VPN 实例。供设备采集页面（华为）展示与导出。
import { ref, reactive } from 'vue'

export function useOspfModule() {
  const neighborList = ref([])
  const searchText = ref('')
  const showTable = ref(false)
  const benchmarkMap = reactive({})
  const dialogVisible = ref(false)
  const currentRow = ref(null)
  const importDialog = ref(false)
  const beforeTextVal = ref('')
  const afterTextVal = ref('')

  const getDiffInfo = (row, field) => {
    if (!row || !row.configDiffFields) return null
    const diff = row.configDiffFields.find(d => d.field === field)
    return diff || null
  }

  // 状态核心提取：'Full/DR' / 'Full/-' -> 'Full'
  const coreState = (s) => (s || '').split('/')[0].trim()

  const parseOspfPeerLog = (text) => {
    const peers = []
    if (!text) return peers
    const lines = text.split('\n')

    // 1) 配置块：建立 进程号 -> { vpnInstance, routerId }，以及接口名 -> OSPF 接口参数
    // 注意：华为 OSPFv3 配置块以 `ospfv3 N` 开头，正则必须带 (v3)? 才能匹配；
    // 否则所有 OSPFv3 进程都不会进入 processMap，VPN 实例全部回退成 '-'。
    // 同时用 `family_pid` 复合 key，避免 v2/v3 同进程号（如 59/60）互相覆盖。
    const processMap = {}
    const ifaceMap = {} // 接口名 -> { cost, hello, networkType, auth }（按 v2_/v3_ 区分协议族）
    let curKey = null
    let curIface = null
    // 把接口级 OSPF 参数写进 ifaceMap（ospf=OSPFv2，ospfv3=OSPFv3）
    const setIface = (flag, field, val, iface) => {
      const fam = flag ? 'v3' : 'v2'
      const k = `${fam}_${iface}`
      if (!ifaceMap[k]) ifaceMap[k] = { cost: '', hello: '', networkType: '', auth: '' }
      ifaceMap[k][field] = val
    }
    for (const line of lines) {
      const proc = line.match(/^ospf(v3)?\s+(\d+)(?:\s+vpn-instance\s+(\S+))?/)
      if (proc) {
        const family = proc[1] ? 'v3' : 'v2'
        curKey = `${family}_${proc[2]}`
        processMap[curKey] = { vpnInstance: proc[3] || '-', routerId: '' }
        curIface = null // 进入进程视图，离开接口视图
        continue
      }
      const rid = line.match(/^\s*router-id\s+(\S+)/)
      if (rid && curKey && processMap[curKey]) {
        processMap[curKey].routerId = rid[1]
      }
      // 接口视图：记录当前接口名
      const itf = line.match(/^interface\s+(\S+)/)
      if (itf) { curIface = itf[1]; curKey = null; continue }
      // 接口级参数（cost / timer hello / network-type / authentication-mode）
      if (curIface) {
        let mm
        if ((mm = line.match(/^\s*ospf(v3)?\s+cost\s+(\d+)/))) { setIface(mm[1], 'cost', mm[2], curIface); continue }
        if ((mm = line.match(/^\s*ospf(v3)?\s+timer\s+hello\s+(\d+)/))) { setIface(mm[1], 'hello', mm[2], curIface); continue }
        if ((mm = line.match(/^\s*ospf(v3)?\s+network-type\s+(\S+)/))) { setIface(mm[1], 'networkType', mm[2], curIface); continue }
        if ((mm = line.match(/^\s*ospf(v3)?\s+authentication-mode/))) { setIface(mm[1], 'auth', true, curIface); continue }
      }
      if (/^#$/.test(line.trim())) { curKey = null; curIface = null } // 退出视图
    }

    // 2) OSPFv2: display ospf peer brief
    let inV2 = false
    let v2Proc = null
    let v2RouterId = ''
    let acceptV2 = false
    for (const line of lines) {
      const proc = line.match(/OSPF Process (\d+) with Router ID (\S+)/)
      if (proc) {
        inV2 = true
        acceptV2 = false
        v2Proc = proc[1]
        v2RouterId = proc[2]
        continue
      }
      if (line.includes('Peer Statistic Information')) continue
      if (!inV2) continue
      if (/^----+$/.test(line.trim())) { acceptV2 = false; continue }
      if (/^Total Peer/.test(line.trim())) { inV2 = false; acceptV2 = false; continue }
      if (/^display|^<.+>|^OSPF Process/.test(line.trim())) { inV2 = false; acceptV2 = false; continue }
      if (line.includes('Area Id') && line.includes('Neighbor')) { acceptV2 = true; continue } // 表头后出现数据行
      if (!acceptV2) continue
      if (!line.trim()) continue
      const m = line.match(/^\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/)
      if (m) {
        const pm = processMap['v2_' + v2Proc] || {}
        const im = ifaceMap['v2_' + m[2]] || {}
        peers.push({
          addressFamily: 'OSPFv2',
          processId: v2Proc,
          routerId: v2RouterId,
          areaId: m[1],
          interface: m[2],
          neighborId: m[3],
          neighborState: coreState(m[4]),
          cost: im.cost || '',
          auth: im.auth || '',
          networkType: im.networkType || '',
          hello: im.hello || '',
          vpnInstance: pm.vpnInstance || '-'
        })
      }
    }

    // 3) OSPFv3: display ospfv3 peer
    let inV3 = false
    let v3Proc = null
    let v3Area = ''
    let acceptV3 = false
    for (const line of lines) {
      const p = line.match(/OSPFv3 Process \((\d+)\)/)
      if (p) { inV3 = true; v3Proc = p[1]; v3Area = ''; acceptV3 = false; continue }
      const a = line.match(/OSPFv3 Area \((\S+)\)/)
      if (a) { v3Area = a[1]; acceptV3 = false; continue }
      if (!inV3) continue
      if (/^----+$/.test(line.trim())) { acceptV3 = false; continue }
      if (line.includes('Neighbor ID') && line.includes('State')) { acceptV3 = true; continue } // 表头后才接受数据行
      if (!acceptV3) continue
      if (!line.trim()) continue
      // Neighbor ID  Pri  State  Dead Time  Interface  Instance ID
      const m = line.match(/^\s*(\S+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s*$/)
      if (m) {
        const pm = processMap['v3_' + v3Proc] || {}
        const im = ifaceMap['v3_' + m[5]] || {}
        peers.push({
          addressFamily: 'OSPFv3',
          processId: v3Proc,
          routerId: pm.routerId || '',
          areaId: v3Area,
          interface: m[5],
          neighborId: m[1],
          neighborState: coreState(m[3]),
          cost: im.cost || '',
          auth: im.auth || '',
          networkType: im.networkType || '',
          hello: im.hello || '',
          vpnInstance: pm.vpnInstance || '-'
        })
      }
    }

    return peers
  }

  const mergeOspfPeerToTable = (peers) => {
    return peers.map(p => ({
      _key: `${p.addressFamily}_${p.processId}_${p.interface}_${p.neighborId}`,
      ...p,
      configDiffFields: [],
      isConsistent: null
    }))
  }

  const updateNeighbors = (newData) => {
    neighborList.value = newData
  }

  return {
    searchText,
    showTable,
    neighborList,
    benchmarkMap,
    dialogVisible,
    currentRow,
    importDialog,
    beforeTextVal,
    afterTextVal,
    getDiffInfo,
    updateNeighbors,
    parseOspfPeerLog,
    mergeOspfPeerToTable
  }
}
