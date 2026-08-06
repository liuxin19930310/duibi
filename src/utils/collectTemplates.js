// 采集命令模板：纯函数（不依赖 settings，便于单元测试）。
// 模板由用户自定义，决定 SSH 采集时下发到设备的 display 命令集；
// 未选模板时走后端内置命令（按采集范围）。
export function findTemplateIn (templates, id) {
  return templates.find(t => t.id === id) || null
}

export function templatesForVendorIn (templates, vendor) {
  return templates.filter(t => t.vendor === vendor)
}

// 解析采集弹窗的选择：返回 { commands, scope }。
// 未选中模板或模板厂商与目标设备不匹配时，commands 为空 → 后端按 scope 内置命令生成。
export function resolveCollectIn (templates, templateId, vendor, scope) {
  const tpl = findTemplateIn(templates, templateId)
  if (!tpl || tpl.vendor !== vendor) return { commands: undefined, scope }
  return { commands: tpl.commands.slice(), scope: tpl.scope }
}

export function templateScopeLabel (scope) {
  return { config: '仅配置', status: '仅状态', full: '配置+状态' }[scope] || '仅配置'
}