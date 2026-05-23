# Physarum / Slime Mold Simulation Research Notes

这些笔记用于支持 `codex_prompt.md`。实现时不要复制第三方项目代码；只参考模型、交互方式和论文思想。

## 用户给出的来源

1. `https://github.com/starboi-63/plasmodial-slime`
   - Unity + compute shader 实时粘菌模拟。
   - README 和作者说明页强调：可支持多种 species、基于食物 attractor field 的觅食行为、画笔添加/擦除食物和粘菌、初始 seed library、可调参数 GUI、高并发 agent。
   - 作者说明页给出一个实用的 agent 结构：位置、角度、speciesID、hunger；species 参数含 sensorAngle、rotationAngle、sensorDist、sensorRadius、velocity、trailWeight、hungerDecayRate。
   - 食物 force 用 inverse-square law；agent 接近食物时消耗食物并把 hunger 恢复到满值；饥饿程度越高，越强地把当前方向混合到食物方向。

2. `https://openprocessing.org/@ntsutae/1906894`
   - 自动检索时被 Cloudflare 阻挡。
   - 在 prompt 中仅作为视觉/交互灵感：如果后续 Codex 或用户能直接打开，应观察它的画面风格、参数面板和交互方式，但不要阻塞实现。

3. `https://physarum.mathigatti.com/`
   - 页面说明这是一个 slime mold simulation，由 Nicolas Barradeau 创建、solquemal 与 mathigatti 修改为音频响应版本。
   - 可作为 Web 端交互演示参考：全屏视觉、实时响应、参数驱动。

## 补充检索到的模型和论文方向

1. Nakagaki, Yamada, Toth, "Maze-solving by an amoeboid organism", Nature, 2000.
   - Physarum plasmodium 是大型 amoeba-like cell，形成 dendritic tube-like pseudopodia 网络。
   - 当两个食物点放在迷宫中时，Physarum 会连接两个食物源，并能找到两点之间的最短长度解。
   - 对网站的意义：加入 maze/preset、两个或多个食物源、显示最短连接路径和粘菌自组织路径对比。

2. Tero, Kobayashi, Nakagaki, "A mathematical model for adaptive transport network in path finding by true slime mold", Journal of Theoretical Biology, 2007.
   - 把 Physarum 建模为管网，边有长度 `L_e` 和可变 conductivity/diameter `D_e(t)`。
   - 电/流体类比：`R_e = L_e / D_e`，节点压力满足 Kirchhoff 线性系统，边流量 `Q_e = D_e (p_u - p_v) / L_e`。
   - 经典自适应规则：`\dot D_e = |Q_e| - D_e`，流量大的管增强，流量小的管萎缩。
   - 对网站的意义：从粒子轨迹场抽取图网络后，用这个管网层做最短营养传输路径优化 overlay。

3. Bonifaci, Mehlhorn, Varma, "Physarum Can Compute Shortest Paths", Journal of Theoretical Biology, 2012/2013.
   - 证明在 Tero 模型设定下，若最短路径唯一，系统会收敛到 source-sink 最短路径。
   - 对网站的意义：LaTeX 文档可以说明这个模型为什么与最短路径有关；UI 可显示 Dijkstra 路径与 Physarum conductance 路径。

4. Jones, "Characteristics of Pattern Formation and Evolution in Approximations of Physarum Transport Networks", Artificial Life, 2010.
   - 多 agent 通过简单 chemotaxis、前向传感器、trail deposition 和 diffusion 形成复杂动态运输网络。
   - 常见参数包括 rotation angle、sensor angle、sensor offset/distance、population density、trail diffusion/decay。
   - 对网站的意义：前端实时画面应主要采用 Jones-style particle/trail 模型，因为它视觉效果强、交互直接。

5. Kay, Mattacchione, Katrycz, Hatton, "Stepwise slime mould growth as a template for urban design", Scientific Reports, 2022.
   - Agent-based growth 模型中，吸引向量由接近食物源生成；食物源耗尽后不再有吸引力。
   - 最终路径几何可转成 point cloud/mesh，再做 shortest-walk/refined network。
   - 对网站的意义：食物热量/卡路里应该逐步耗尽；耗尽后吸引力下降；路径优化可以从轨迹点云提炼。

6. MDN WebAssembly guide, "Compiling a new C/C++ module to WebAssembly".
   - C/C++ 可通过 Emscripten 编译成 WebAssembly。
   - Emscripten 会生成 `.wasm` 和 JS glue code；浏览器运行需要 HTTP server。
   - 若 JS 调用 C/C++ 函数，可使用 `EMSCRIPTEN_KEEPALIVE` 与 `ccall()`，或输出 ES module factory。

## 建议的实现路线

- 用 C++/WASM 做 simulation state 和每帧 step。
- 用 React/Vite/TypeScript 做 UI、Canvas/WebGL 绘制、参数控制、图表和 LaTeX 文档链接。
- 用 Jones-style agent/trail 模型产生视觉和基础觅食。
- 用 energy/food/growth/search mode 扩展生命过程。
- 用 Tero-style adaptive network 在低频率上从轨迹/食物点构建图并优化营养传输路径。
- 所有公式写入 `docs/model.tex`，并和代码变量保持同名或有映射表。

## 关键参考链接

- User source: https://github.com/starboi-63/plasmodial-slime
- Author notes for that project: https://tanishmakadia.com/projects/slime-simulation
- User source: https://openprocessing.org/@ntsutae/1906894
- User source: https://physarum.mathigatti.com/
- Nakagaki et al. 2000: https://www.nature.com/articles/35035159
- Tero et al. 2007: https://pubmed.ncbi.nlm.nih.gov/17069858/
- Bonifaci et al. shortest path proof: https://www.iasi.cnr.it/~vbonifaci/pub/physarum-jtb.pdf
- Jones 2010 repository record: https://uwe-repository.worktribe.com/output/980579/characteristics-of-pattern-formation-and-evolution-in-approximations-of-physarum-transport-networks
- Kay et al. 2022: https://pmc.ncbi.nlm.nih.gov/articles/PMC8789834/
- MDN C/C++ to WebAssembly: https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/C_to_Wasm
