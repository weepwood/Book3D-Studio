# 渲染性能诊断（V0.7）

在 URL 添加 `?perf=1`，读取 `.canvas-host` 的 `data-perf`、`data-perf-renderer`、`data-perf-gpu-supported`。样本最多保留 300 个；正常访问不执行采样。GPU 使用 EXT_disjoint_timer_query_webgl2 异步查询，遇到 disjoint 丢弃不可靠样本，不支持则报告空值。CPU frame 为一帧 JS 更新及提交耗时；inputToSubmit 从最近一次实际 dragPage 更新到提交完成，不是鼠标到屏幕的端到端延迟；frameGap 排除超过 500ms 的闲置间隔。分位数采用 floor((n-1)*p)，少量拾取样本不适合总体推断。

本地复现：`BOOK3D_CHROMIUM_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' BOOK3D_HARDWARE_GPU=1 npm run test:browser -- browser-tests/geometry-performance.spec.ts`。省略 BOOK3D_HARDWARE_GPU 时使用 SwiftShader，CI 默认不变。`render-perf.json` 由测试生成。测试包括开书、16 步鼠标拖动、释放到跨页 1；不将启动或软件/硬件差异视为优化前后对照。

2026-11-25 本机候选最终硬件运行，1280×800，ANGLE Metal Renderer: Apple M4，实际 201 帧：

|指标|n|P50 ms|P95 ms|
|---|---:|---:|---:|
|帧间隔|199|16.7|16.8|
|CPU frame|201|1.5|2.7|
|CPU pick|2|0.2|0.2|
|inputToSubmit|16|0.9|1.8|
|GPU render|200|0.939|1.395|

单次场景、非稳定压力基准。此前软件渲染样本（相机规格重建修复前）GPU P95 326.15ms、frameGap P95 183.4ms，不能与 M4 直接作优化倍率对比。真实高分屏、Windows GPU、厚块持续抓取、多页面并行、完整硬件输入到屏幕延迟仍需测量。
