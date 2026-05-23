# Prompt for Codex: C++/WebAssembly Interactive Physarum Website

你是 Codex，请从零实现一个交互式网页应用：用 C++ 负责粘菌仿真计算，并把 C++ 编译为 WebAssembly；用现代网页前端负责交互、可视化、参数控制和文档展示。

请直接实现，不要只给计划。完成后运行构建、测试和浏览器验证，并告诉我本地访问地址。

## 项目目标

我要做一个粘菌 / Physarum polycephalum 模拟网站。首页就是可用的模拟器，不要做营销 landing page。用户应该可以实时看到粘菌探索、吃食物、恢复能量、生长、继续搜索或进入低能量状态，并看到网络如何逐步优化营养传输路径。

核心要求：

- C++ 仿真核心，Web 前端调用 C++/WASM 进行计算。
- 前端有交互画布，可以自己添加粘菌、食物、擦除/清空、暂停、单步、重置。
- 可以设定粘菌数量、食物热量/卡路里、食物吸引力、粘菌能量、生长成本、移动成本、搜索倾向、trail 扩散/衰减、传感器角度/距离、转向角、速度等。
- 粘菌需要能量；移动、搜索和维持生命消耗能量；吃东西恢复能量；能量充足才会生长或分裂；能量过低会降低速度、转向觅食、休眠或死亡。
- 明确建模“是否会尝试继续搜索”：用一个随能量和局部信号变化的概率/状态机，而不是纯随机移动。
- 有营养传输网络优化层：从 trail/食物点抽取图，使用 Physarum/Tero 风格的自适应管网流量模型，显示最短或低成本营养传输路径。
- 写一个 LaTeX 文档，说明全部公式、变量、假设、离散化和参考文献。
- 做成漂亮、可玩、可检查的科学模拟工具，而不是静态特效。

## 参考资料

请先阅读并吸收这些来源的思想，但不要复制第三方代码：

- `https://github.com/starboi-63/plasmodial-slime`
- `https://tanishmakadia.com/projects/slime-simulation`
- `https://openprocessing.org/@ntsutae/1906894`，如果自动访问被阻挡，就把它作为视觉/交互参考，不要阻塞实现。
- `https://physarum.mathigatti.com/`
- Nakagaki, Yamada, Toth, "Maze-solving by an amoeboid organism", Nature, 2000: `https://www.nature.com/articles/35035159`
- Tero, Kobayashi, Nakagaki, "A mathematical model for adaptive transport network in path finding by true slime mold", Journal of Theoretical Biology, 2007: `https://pubmed.ncbi.nlm.nih.gov/17069858/`
- Bonifaci, Mehlhorn, Varma, "Physarum Can Compute Shortest Paths": `https://www.iasi.cnr.it/~vbonifaci/pub/physarum-jtb.pdf`
- Jones, "Characteristics of Pattern Formation and Evolution in Approximations of Physarum Transport Networks", Artificial Life, 2010: `https://uwe-repository.worktribe.com/output/980579/characteristics-of-pattern-formation-and-evolution-in-approximations-of-physarum-transport-networks`
- Kay et al., "Stepwise slime mould growth as a template for urban design", Scientific Reports, 2022: `https://pmc.ncbi.nlm.nih.gov/articles/PMC8789834/`
- MDN C/C++ to WebAssembly guide: `https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/C_to_Wasm`

## 技术栈

优先使用：

- Frontend: React + Vite + TypeScript。
- Rendering: Canvas 2D 或 WebGL。若 agent 数量超过 50k，至少保证 Canvas ImageData/typed array 渲染稳定；如用 WebGL，要保持代码可读。
- Simulation: C++17 或 C++20。
- C++ to browser: Emscripten，输出 ES module/WASM，并写 TypeScript wrapper。
- Documentation: `docs/model.tex` 和 `docs/references.bib`。
- Tests: C++ 逻辑测试 + TypeScript/Vitest 或 Playwright 交互 smoke test。

请尽量让项目能用这些命令跑起来：

```bash
npm install
npm run build:wasm
npm run dev
npm test
```

如果本机没有 Emscripten，请：

- 仍然写好 `build:wasm` 脚本和 README。
- 提供一个 JS fallback simulation adapter，只用于开发预览，并在 UI 明确标出当前是 fallback 还是 WASM。
- 不要把 fallback 当成最终核心；C++/WASM 路线必须完整。

## 期望目录结构

可以按实际需要调整，但应大致包含：

```text
physarum-cpp-web/
  package.json
  vite.config.ts
  src/
    App.tsx
    main.tsx
    styles.css
    wasm/
      physarum.ts
    components/
      SimulationCanvas.tsx
      ControlPanel.tsx
      MetricsPanel.tsx
      FormulaPanel.tsx
      Toolbar.tsx
    state/
      presets.ts
      types.ts
  cpp/
    CMakeLists.txt 或 build 脚本
    physarum.hpp
    physarum.cpp
    wasm_exports.cpp
    tests/
      test_energy.cpp
      test_network.cpp
  public/
    wasm/
  docs/
    model.tex
    references.bib
  README.md
```

## UI 和交互要求

第一屏就是模拟器：

- 中央/左侧大画布显示粘菌 trail、agent、食物和网络 overlay。
- 右侧或底部控制面板，信息密度高但清晰，不要做大 hero。
- 工具模式：添加粘菌、添加食物、擦除、添加障碍、选择/检查点。
- 鼠标/触控：
  - 点击或拖拽添加粘菌。
  - 点击添加食物，食物默认热量来自当前 slider。
  - Shift/Option 或 toolbar 可切换 brush radius。
  - 悬停食物/粘菌聚集区域显示局部信息。
- 控制：
  - Pause/Play、Step、Reset、Random Seed。
  - Presets: Empty, Two Food Maze, Ring Search, City Nodes, Dense Bloom。
  - Slime count slider，支持重新播种或增量添加。
  - Food calories/heat slider，food radius，food quality/attraction。
  - Energy: max energy, base metabolism, move cost, search cost, eating efficiency。
  - Growth: growth threshold, growth rate, split threshold, death starvation time。
  - Trail: deposit rate, diffusion radius, decay, sensor distance, sensor angle, turn angle, speed。
  - Network overlay: show graph, show conductance tubes, show Dijkstra path, show Tero path, update interval。
- 指标：
  - Alive agents, total biomass, average energy, food remaining, search/exploit/dormant counts。
  - Current shortest path length, transport cost, dissipation, network efficiency。
  - FPS 和 simulation steps/sec。
- 可视化 toggles：
  - Trail field, food attractant, energy heatmap, agent directions, network tubes, shortest path。
- Formula panel：
  - 显示核心公式摘要，并链接/说明 `docs/model.tex`。

设计要求：

- 科学工具风格：克制、清晰、信息可扫读。
- 不要用一堆营销卡片；不要做 landing page。
- 用图标按钮表示工具模式，按钮加 tooltip。
- 保证移动端可用，至少能查看、播放/暂停、添加食物和调整关键参数。

## C++ 仿真模型

### 数据结构

实现类似：

```cpp
struct Agent {
  float x, y;
  float theta;
  float energy;
  float mass;
  uint8_t mode;   // search, exploit, dormant
  uint8_t alive;
};

struct Food {
  float x, y;
  float calories;
  float quality;
  float sigma;
  float radius;
};
```

字段：

- `trail[width * height]`
- `foodAttractant[width * height]`
- optional `obstacles[width * height]`
- network graph buffers for nodes, edges, conductance, flow, selected path。

### 轨迹和食物场

食物吸引场：

```tex
A_t(x,y)=\sum_k q_k
\frac{C_k(t)}{C_k(t)+C_{1/2}+\varepsilon}
\exp\left(-\frac{\|(x,y)-f_k\|^2}{2\sigma_{A,k}^2}\right)
```

trail 更新：

```tex
T_{t+\Delta t}=(1-\lambda_T\Delta t)\left(G_{\sigma_T}*(T_t+D_t)\right)
```

实现上用 separable blur 或多次 box blur 近似 Gaussian，避免每帧大卷积太慢。

### 传感器和运动

每个 agent 有前、左、右三个传感器：

```tex
z_i^\delta(t)=p_i(t)+d_su(\theta_i(t)+\delta\alpha),
\qquad \delta\in\{-1,0,+1\}
```

采样 combined field：

```tex
S_t=w_TT_t+w_AA_t-w_RR_t-w_OO
```

转向规则：

- 前方最大：保持方向。
- 左侧最大：向左转。
- 右侧最大：向右转。
- 都很弱或相近：根据搜索概率加入随机探索。

### 是否继续搜索

实现一个清晰的概率/状态机。建议公式：

```tex
P_i^{search}=
\sigma\left(k_E\left[\frac{E_i}{E_{max}}-\theta_d\right]\right)
\left(1-\sigma\left(k_S[S_i^{max}-\tau_S]\right)\right)
```

然后 clip 到 `[0,1]`。

解释：

- 能量高于休眠阈值时，才更可能继续探索。
- 局部 trail/food 信号弱时，更可能继续搜索。
- 信号强时进入 exploit，沿梯度强化已有路径。
- 能量极低且无食物信号时进入 dormant 或死亡倒计时。

### 食物吸引和饥饿偏置

食物 force：

```tex
F_i^{food}=\sum_k
\frac{\chi(C_k>0)c_k}{\|f_k-p_i\|^2+\varepsilon}
\frac{f_k-p_i}{\|f_k-p_i\|+\varepsilon}
```

饥饿/能量偏置：

```tex
\rho_i=\mathrm{clip}\left(\|F_i^{food}\|
\left(1-\frac{E_i}{E_{max}}\right)^\eta,0,1\right)
```

当 agent 饿时更容易被食物方向吸引。

### 能量、进食、生长、分裂、死亡

能量损失：

```tex
L_i=\Delta t(c_bm_i+c_mv_i^2m_i+c_s\mathbf{1}_{mode=search})
```

进食：

```tex
G_{ik}=\min(C_k,\eta_{eat}q_k\Delta t),\quad \|p_i-f_k\|<r_k
```

更新：

```tex
\hat E_i=\mathrm{clip}(E_i+\eta_E\sum_k G_{ik}-L_i,0,E_{max})
```

生长：

```tex
\Delta m_i=r_g\left[\frac{\hat E_i}{E_{max}}-\theta_g\right]_+m_i\Delta t
```

生长消耗能量：

```tex
E_i(t+\Delta t)=\hat E_i-\kappa_g\Delta m_i
```

分裂：

- 当 `mass > splitMass` 且 `energy > splitEnergy`，分裂出新 agent。
- 新 agent 位置轻微偏移，方向扰动，父子质量/能量按比例分配。

死亡：

- `energy <= 0` 连续超过 `starvationSteps` 后死亡。
- 死亡可留下少量 trail/biomass residue，也可直接移除，由参数控制。

## 网络优化层

在低频率上，例如每 10-30 帧：

1. 从活跃食物点、用户点、trail ridge/高强度区域采样 graph nodes。
2. 连接近邻节点，边长度为欧氏距离或避障路径距离。
3. 每条边有 conductivity `D_e`。
4. 用 Tero/Physarum 管网模型更新 conductance。
5. 用 Dijkstra/A* 在动态图上显示当前最短营养传输路径。

公式：

```tex
C_e=\frac{D_e}{\ell_e+\varepsilon},\qquad
L_D=B\,\mathrm{diag}(C_e)B^\top
```

```tex
L_D P=b
```

```tex
Q_e=C_e(P_u-P_v)
```

原始 Tero 规则：

```tex
\dot D_e=|Q_e|-D_e
```

交互模拟可用 bounded variant：

```tex
D_e(t+\Delta t)=\max\left(D_{min},
D_e+\Delta t\left[
\alpha_D\frac{|Q_e|^\gamma}{|Q_e|^\gamma+q_0^\gamma+\varepsilon}
-\mu_DD_e
\right]\right)
```

路径 cost：

```tex
c_e^{path}=\frac{\ell_e}{(D_e+\varepsilon)^\eta}
+\lambda_rR_e^{risk}+\lambda_oO_e
```

UI 中显示：

- conductance tubes: 线宽随 `D_e`。
- flow direction: 小箭头或动画粒子随 `Q_e`。
- shortest nutrient path: 高亮路径。
- metrics: path length, transport cost, dissipation。

## WASM API 要求

暴露一个清晰的 C++/WASM API，TypeScript wrapper 不要把指针细节泄漏到 React 组件。

建议导出：

```cpp
extern "C" {
  void sim_init(int width, int height, int seed);
  void sim_reset(int seed);
  void sim_step(int steps);
  void sim_set_param(int param_id, double value);
  void sim_add_agents(float x, float y, int count, float radius, float energy);
  void sim_add_food(float x, float y, float calories, float radius, float quality);
  void sim_erase(float x, float y, float radius);
  int sim_get_agent_count();
  int sim_get_food_count();
  float* sim_get_trail_ptr();
  float* sim_get_food_field_ptr();
  float* sim_get_agent_ptr();
  float* sim_get_metrics_ptr();
  float* sim_get_network_ptr();
}
```

如果用 Embind 也可以，但要确保类型安全、性能好、README 写清楚。

## LaTeX 文档要求

必须创建：

- `docs/model.tex`
- `docs/references.bib`

`model.tex` 至少包含：

1. Introduction: 说明这是理想化模型，不是生物校准模型。
2. Notation table: agent、food、field、network 变量。
3. Trail/food fields。
4. Agent sensing and motion。
5. Search/exploit/dormant mode decision。
6. Energy budget。
7. Eating and food depletion。
8. Growth, division, death。
9. Adaptive transport network。
10. Shortest nutrient path optimization。
11. Numerical integration/discretization。
12. Limitations and future work。
13. References。

公式要和代码参数同名或给出映射表。README 中写如何编译 LaTeX；如果环境有 `latexmk`，请验证能生成 PDF。

## 质量要求

- 不要只用随机点画特效；每个可见行为都要对应模型状态。
- 画布渲染要稳定，窗口 resize 后仍然正确。
- 大量 agent 时 UI 不应卡死；必要时限制默认数量并给性能提示。
- 参数修改应即时生效。
- Reset/preset 必须可重复，seed 固定时结果可复现。
- TypeScript 不要有 `any` 到处乱飞。
- C++ 做边界检查，避免越界访问 WASM memory。
- 所有用户可见文本简洁，不要用说明大段占据模拟器空间。
- README 写清楚安装、构建 WASM、运行、测试、模型来源。

## 测试和验证

至少实现并运行：

- C++ energy test: agent 移动消耗能量；吃到食物后能量上升；食物 calories 下降。
- C++ growth test: 高能量 agent 增长/分裂；低能量 agent 不增长。
- C++ search test: `P_search` 在 `[0,1]`，弱信号时更高，强信号时更低。
- C++ network test: toy graph 上 Dijkstra 找到预期最短路径；conductance update 强化高流量边。
- Frontend smoke test: app loads, play/pause works, click adds food, click adds slime, metrics update。
- Build test: `npm run build` 成功。

完成前请用浏览器检查：

- 桌面 viewport。
- 移动 viewport。
- 添加食物、添加粘菌、调整食物热量、播放/暂停、打开 network overlay。
- 检查 console 没有错误。

## 最终汇报

最终告诉我：

- 新工程目录。
- 本地运行 URL。
- 关键实现文件。
- 已完成的模型功能。
- 已运行的测试命令和结果。
- 如果 Emscripten/LaTeX/浏览器验证有环境阻塞，明确说明。
