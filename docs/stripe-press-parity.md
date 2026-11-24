# Stripe Press 对齐规范

以镜像仓库构建产物中可验证的实现为依据，而不是主观增加视觉效果。独立代码实现，不复制原版模型、图片和整段 bundle。

## 证据
- [交互与翻页状态](https://github.com/weepwood/weepwood.github.io/blob/main/_next/static/immutable/chunks/04ud9hjinltfg.js)：拖动 5px 区分、指数平滑 .4、渲染 .85；吸附 .008 正弦加速度、角度相关阻尼、.005 rad / .0005 rad 每归一化帧停止阈值。原版有多活动页时 .18 rad 每帧快速分支，当前只借鉴该分支处理顺序队列。
- [参数来源](https://github.com/weepwood/weepwood.github.io/blob/main/_next/static/immutable/chunks/12s2cqzsl56ip.js)：dragCurlRad 7.02、power .86、foldTiltDeg 31.5、pivotU .74、pivotV .5、span 32.4、stretch 0、easeDrag .14、hoverFrac .14；书芯弹簧 stiffness 18 / damping 7。
- [曲面着色](https://github.com/weepwood/weepwood.github.io/blob/main/_next/static/immutable/chunks/3fe65qr7ey8j5.js)：33 节物理链、位置/切线纹理、Hermite 插值、局部可展开卷曲叠加、同样形变用于阴影深度。绝对 span 需结合模型单位与页面宽度；不能直接作为本项目世界单位。

## 本轮
拖拽映射、净位移释放、逻辑角与渲染角分离、角度吸附、顺序队列与请求/落地页码诊断。原版时间尺度默认 60Hz，编辑器响应参数保留为可选缩放；当前拖动映射按工作台视口宽度适配，不是原站全窗宽度。去掉此前人为设置的整张纸悬停旋转。保留现有程序化书籍和 CPU 曲面作为过渡，不把参考参数未经单位换算直接塞入旧模型。

## 待验收 / 不宣称已还原
原版 33 节物理链、局部卷曲与抓取 UV 精确映射、独立多叶及防交叉、分组翻页、封面/书芯重力过渡、相机与真实材质对照。需逐步做原版与本项目相同输入的视频/截图对照，不能用单元测试代替视觉验收。
