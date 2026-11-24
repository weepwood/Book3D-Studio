# Book3D Studio 交接指南

## 开发原则
- 以 Stripe Press 镜像实际实现为证据；先读 docs/stripe-press-parity.md 和其引用的构建模块。不要自主创造或声称已还原未知效果。
- 独立实现，禁止直接复制原版专有模型、图片或整段构建代码；未知单位和参数先验证。
- 日常改动快速 CI，高风险渲染改动执行 Reader smoke；正式发布完整验收。CI 不通过不合并。下轮对话复查 PR，无需自动定时任务。
- 中文提交信息。保持本地素材、旧版 JSON/IndexedDB 兼容。
## 当前阶段
- V0.4.1 PR #5 已合并（2636bc4），27 单元测试与真实 Chromium WebGL 测试通过。
- V0.4.2 分支 feat/v0.4.2-gpu-pages：33×2 GPU 链纹理、共用阴影深度形变、最多六活动叶。合并状态以 PR/CI 为准。
- 待完成：原版平衡/弯曲书芯、独立多页回收、交互刹车与分组、打开时重力落页、相机和材质视觉对照。暂停 PDF 与外围功能。
## 文件
src/core/pressReference.ts 原版证据参数；pageChain.ts CPU 参考；pageGpu.ts GPU；pageWindow.ts 活动窗口；pagePhysics.ts 控制；pages.ts 与 book.ts 组装；runtime.ts 渲染交互；browser-tests/reader.spec.ts WebGL 验收。
