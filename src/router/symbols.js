// Router 插件机制的内部槽位（从 naive-ui-pro 改造，去掉 TS 类型增强）。
// 用 Symbol 挂在 router 实例上，供 setupPlugin 在 effectScope 内运行插件。
const DEV = import.meta.env.DEV

export const APP = Symbol(DEV ? 'app' : '')
export const EFFECT_SCOPE = Symbol(DEV ? 'effect scope' : '')
export const UNMOUNT_HANDLERS = Symbol(DEV ? 'uninstall handlers' : '')
export const RUN_WITH_APP_HANDLERS = Symbol(DEV ? 'run with app handlers' : '')
export const ALREADY_INSTALLED = Symbol(DEV ? 'already installed' : '')
export const ROUTE_NAME = Symbol(DEV ? 'route name' : '')
export const ROUTE_COMPONENT_NAME = Symbol(DEV ? 'route component name' : '')
