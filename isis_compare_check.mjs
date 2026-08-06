import { readFileSync } from 'fs'
import { useIsisModule } from './src/utils/isis.js'

const text = readFileSync('C:/Users/Liuxin/Desktop/2026宁夏移动AR替换/NXYC-BA-IPNET-RT01-NE40EX16.log', 'utf8')
const { parseIsisStatusLog, mergeIsisStatusToTable } = useIsisModule()
const statusMap = parseIsisStatusLog(text)
const rows = mergeIsisStatusToTable(statusMap)
console.log('ISIS parsed rows:', rows.length)
if (rows.length > 0) {
  console.log('First row keys:', Object.keys(rows[0]).join(', '))
  console.log('Sample row:', JSON.stringify(rows[0], null, 2))
}
