# 萤火虫同步模拟：规则总表与 LaTeX 公式

本文是当前 `firefly_sim` 项目的规则说明，覆盖相位同步、移动、蝙蝠捕食者、光污染、障碍物、多种群、交互工具、性能与调试规则。它对应当前实现，而不是早期草案。

---

## 1. 核心目标

模拟二维空间中的萤火虫同步现象：

$$
\text{local interaction}+\text{phase oscillator}
\longrightarrow
\text{collective synchronization}
$$

每只萤火虫是一个相位振荡器。它只能和视觉范围内、且未被障碍物遮挡的邻居耦合。系统可出现：

- 全局无序：$r \approx 0$ 且 $\bar r_{\text{local}}\approx 0$。
- 局部同步岛：$r \approx 0$ 但 $\bar r_{\text{local}}>0$。
- 全局同步：$r \approx 1$ 且 $\bar r_{\text{local}}\approx 1$。

---

## 2. 当前默认参数

当前 UI 默认值以降低 CPU/内存压力为主：

```text
N = 125
L = 10
K = 2
R_visual = 2
D = 0.02
omega0 = 1
sigma_omega = 0.5
dt = 0.01
speed = 1
sigma_flash = 0.25
mobilityEnabled = true
moveProbability = 0.1
v_firefly = 0.25
batCount = 0
```

重要性能规则：

- Canvas 默认缩小，避免大画布造成 GPU/CPU 压力。
- UI snapshot 约 10 fps 刷新；仿真可继续按帧推进。
- 默认 `N=125`，如需更高密度可手动调高。
- `R_visual` 可调范围比默认更大，用于补偿低 `N` 时邻居过少的问题。

---

## 3. 状态变量

### 3.1 萤火虫

```cpp
struct Firefly {
  float x, y;
  float vx, vy;
  float heading;
  float speed;
  float theta;
  float omega;
  float brightness;
  float localOrder;
  float panic;
  int neighborCount;
  uint8_t species;
  uint8_t alive;
};
```

解释：

- `x,y`：空间位置。
- `vx,vy`：当前速度。
- `heading`：移动方向。
- `theta`：相位。
- `omega`：自然频率。
- `brightness`：由相位或捕食者压制规则决定。
- `panic`：受蝙蝠压力影响的恐慌指标。
- `alive=0`：被蝙蝠捕获，不再参与同步和渲染。

### 3.2 蝙蝠

```cpp
struct Bat {
  float x, y;
  float vx, vy;
  float heading;
  float speed;
  float perceptionRadius;
  float captureRadius;
  int targetIndex;
  float hunger;
  float speedBias;
  float turnRate;
  float decisionTimer;
  float decisionInterval;
  float brightnessWeight;
  float distanceWeight;
  float noisePhase;
  uint8_t active;
};
```

每只蝙蝠有个体差异，避免两个蝙蝠重叠后行为完全同步。

---

## 4. 初始条件

萤火虫位置：

$$
x_i,y_i\sim U(0,L)
$$

相位：

$$
\theta_i(0)\sim U(0,2\pi)
$$

单种群自然频率：

$$
\omega_i\sim \mathcal{N}(\omega_0,\sigma_\omega^2)
$$

两种群自然频率：

$$
\omega_i^{(A)}\sim \mathcal{N}(\omega_A,\sigma_\omega^2),
\qquad
\omega_i^{(B)}\sim \mathcal{N}(\omega_B,\sigma_\omega^2)
$$

---

## 5. 空间邻居与遮挡

距离：

$$
d_{ij}=\|\mathbf{x}_i-\mathbf{x}_j\|
$$

基础邻接：

$$
A_{ij}=
\begin{cases}
1,&0<d_{ij}\le R_{\text{visual}}\\
0,&\text{otherwise}
\end{cases}
$$

邻居数量：

$$
k_i=\sum_j A_{ij}
$$

如果启用障碍物遮挡：

$$
A_{ij}
=
\mathbb{I}(0<d_{ij}\le R_{\text{visual}})
\cdot
\mathbb{I}(\text{line}(i,j)\ \text{not blocked})
$$

被捕获的萤火虫 `alive=0`，不参与邻接、局部同步、全局同步和渲染。

---

## 6. Spatial Kuramoto 相位动力学

单种群基础模型：

$$
\frac{d\theta_i}{dt}
=
\omega_i
+
\frac{K}{k_i}
\sum_j A_{ij}\sin(\theta_j-\theta_i)
+
\xi_i(t)
$$

若 $k_i=0$，耦合项为 $0$。归一化因子 $1/k_i$ 防止邻居多的个体受到过强耦合。

噪声：

$$
\xi_i(t)=\sqrt{2D}\eta_i(t)
$$

随机微分形式：

$$
d\theta_i
=
\left[
\omega_i+
\frac{K}{k_i}
\sum_j A_{ij}\sin(\theta_j-\theta_i)
\right]dt
+
\sqrt{2D}\,dW_i(t)
$$

---

## 7. 数值更新

Euler-Maruyama 离散化：

$$
\theta_i(t+\Delta t)
=
\theta_i(t)
+
\left[
\omega_i+
\frac{K}{k_i}
\sum_j A_{ij}\sin(\theta_j(t)-\theta_i(t))
\right]\Delta t
+
\sqrt{2D\Delta t}Z_i
$$

其中：

$$
Z_i\sim\mathcal{N}(0,1)
$$

相位 wrap：

$$
\theta_i\leftarrow \theta_i\bmod 2\pi
$$

---

## 8. 闪光与亮度

二值闪光：

$$
F_i(t)=
\begin{cases}
1,&\theta_i(t-\Delta t)>\theta_i(t)\\
0,&\text{otherwise}
\end{cases}
$$

余弦亮度：

$$
B_i(t)=\frac{1+\cos\theta_i(t)}{2}
$$

尖峰亮度：

$$
B_i(t)=
\exp\left[
-\frac{\operatorname{wrap}(\theta_i(t))^2}
{2\sigma_{\text{flash}}^2}
\right]
$$

其中：

$$
\operatorname{wrap}(\theta)=((\theta+\pi)\bmod 2\pi)-\pi
$$

### 蝙蝠压制闪光规则

如果活萤火虫处在任意蝙蝠感知半径内：

$$
d_{ib}\le R_{\text{bat\_perception}}
$$

则本步：

$$
\theta_i(t+\Delta t)=\theta_i(t),
\qquad
B_i(t+\Delta t)=0
$$

也就是说：它不发光，也不更新自然频率/相位。

---

## 9. 同步指标

全局 Kuramoto order parameter：

$$
r(t)e^{i\psi(t)}
=
\frac{1}{N_{\text{alive}}}
\sum_{j:\text{alive}} e^{i\theta_j(t)}
$$

$$
r(t)
=
\left|
\frac{1}{N_{\text{alive}}}
\sum_{j:\text{alive}} e^{i\theta_j(t)}
\right|
$$

局部同步：

$$
r_i^{\text{local}}(t)
=
\left|
\frac{1}{k_i}
\sum_j A_{ij}e^{i\theta_j(t)}
\right|
$$

平均局部同步：

$$
\bar r_{\text{local}}(t)
=
\frac{1}{N_{\text{alive}}}
\sum_{i:\text{alive}} r_i^{\text{local}}(t)
$$

---

## 10. 临界耦合与扫描

稳态平均：

$$
\bar r(q)=
\frac{1}{M_T}
\sum_{t>T_{\text{burn}}}
r(t)
$$

临界耦合估计：

$$
K_c=\min\{K:\bar r(K)>r_{\text{threshold}}\}
$$

全局耦合高斯频率分布的参考近似：

$$
K_c=
\frac{2\sqrt{2\pi}\sigma_\omega}{\pi}
$$

空间局部耦合下实际临界值依赖：

$$
K_c=K_c(\sigma_\omega,R_{\text{visual}},N,D)
$$

---

## 11. 城市光污染

城市灯光作为外部驱动：

$$
\frac{d\theta_i}{dt}
=
\omega_i
+
\frac{K}{k_i}
\sum_j A_{ij}\sin(\theta_j-\theta_i)
+
\epsilon_{\text{city}}
\sin(\Omega_{\text{city}}t+\phi_{\text{city}}-\theta_i)
+
\xi_i(t)
$$

锁频指标：

$$
\Delta_{\text{lock}}
=
\left|
\frac{d\psi}{dt}
-
\Omega_{\text{city}}
\right|
$$

---

## 12. 多种群规则

种内/种间耦合：

$$
K_{ij}
=
\begin{cases}
K_{\text{in}},&s_i=s_j\\
K_{\text{out}},&s_i\ne s_j
\end{cases}
$$

两种群动力学：

$$
\frac{d\theta_i}{dt}
=
\omega_i+
\frac{1}{k_i}
\sum_j A_{ij}K_{ij}\sin(\theta_j-\theta_i)
+
\xi_i(t)
$$

种群序参量：

$$
r_A(t)=
\left|
\frac{1}{N_A}
\sum_{j\in A}e^{i\theta_j(t)}
\right|,
\qquad
r_B(t)=
\left|
\frac{1}{N_B}
\sum_{j\in B}e^{i\theta_j(t)}
\right|
$$

---

## 13. 萤火虫移动规则

萤火虫移动是概率事件，不是每步都移动。

普通状态：

$$
P(\text{move at step})=p_{\text{move}}
$$

当前默认：

$$
p_{\text{move}}=0.1
$$

如果被蝙蝠感知/追逐：

$$
d_{ib}\le R_{\text{bat\_perception}}
\Longrightarrow
P(\text{move at step})=1
$$

移动方向使用 correlated random walk：

$$
\alpha_i(t+\Delta t)
=
\alpha_i(t)
+
\sqrt{2D_{\text{turn}}\Delta t}Z_i
$$

随机移动速度：

$$
\mathbf{v}_i^{\text{random}}
=
v_{\text{firefly}}
\begin{bmatrix}
\cos\alpha_i\\
\sin\alpha_i
\end{bmatrix}
+
\sqrt{2D_{\text{move}}\Delta t}\boldsymbol{\eta}_i
$$

---

## 14. 蝙蝠躲避规则

对满足 $d_{ib}<R_{\text{avoid}}$ 的蝙蝠，萤火虫加入排斥速度：

$$
\mathbf{v}_i^{\text{avoid}}
=
\sum_b
\chi_{\text{bat}}
\left(1-\frac{d_{ib}}{R_{\text{avoid}}}\right)
\frac{\mathbf{x}_i-\mathbf{x}_b}{d_{ib}+\epsilon}
$$

总速度：

$$
\mathbf{v}_i
=
\mathbf{v}_i^{\text{random}}
+
\mathbf{v}_i^{\text{avoid}}
$$

位置更新：

$$
\mathbf{x}_i(t+\Delta t)
=
\mathbf{x}_i(t)
+
\mathbf{v}_i\Delta t
$$

边界规则为反射边界，保证所有 agent 留在 $[0,L]^2$。

恐慌指标：

$$
p_i
=
\max_b
\left(1-\frac{d_{ib}}{R_{\text{avoid}}}\right)_+
$$

---

## 15. 蝙蝠捕食者策略

### 15.1 个体差异

每只蝙蝠初始化时带有固定个体参数：

```text
speedBias
turnRate
decisionInterval
brightnessWeight
distanceWeight
noisePhase
```

实际速度：

$$
v_b^{\text{actual}}
=
v_{\text{bat}}\cdot \text{speedBias}_b
$$

### 15.2 top-k softmax 目标选择

蝙蝠不是每步都重新决策，而是每隔自己的 `decisionInterval` 重新选择目标。

候选萤火虫需满足：

$$
d_{bj}\le R_{\text{bat\_perception}},
\qquad
\text{alive}_j=1
$$

目标得分：

$$
s_{bj}
=
w_b^{(B)}
\frac{B_j}{d_{bj}+\epsilon}
+
w_b^{(D)}
\frac{1}{d_{bj}+\epsilon}
+
\zeta
$$

其中：

- $w_b^{(B)}$ 对应 `brightnessWeight`。
- $w_b^{(D)}$ 对应 `distanceWeight`。
- $\zeta$ 是小随机扰动。

先取分数最高的 top-k：

$$
\mathcal{C}_b=\operatorname{TopK}_j(s_{bj})
$$

再用 softmax 采样：

$$
P(j\mid b)
=
\frac{
\exp(s_{bj}/T_{\text{bat}})
}{
\sum_{\ell\in \mathcal{C}_b}
\exp(s_{b\ell}/T_{\text{bat}})
}
$$

`T_bat = batSoftmaxTemperature`。温度越低越接近贪心 argmax，温度越高越随机。

### 15.3 追逐更新

目标方向：

$$
\beta_b^*
=
\operatorname{atan2}(y_{j^*}-y_b,x_{j^*}-x_b)
+
\sigma_{\text{chase}}Z_b
$$

平滑转向：

$$
\beta_b(t+\Delta t)
=
\beta_b(t)
+
\lambda_b
\operatorname{wrap}(\beta_b^*-\beta_b(t))
$$

其中 $\lambda_b$ 对应 `turnRate`。

### 15.4 蝙蝠-蝙蝠分离

当两个蝙蝠距离过近：

$$
d_{bb'}<R_{\text{bat\_sep}}
$$

加入分离速度：

$$
\mathbf{v}_b^{\text{sep}}
=
\sum_{b'\ne b}
\gamma_{\text{sep}}
\left(1-\frac{d_{bb'}}{R_{\text{bat\_sep}}}\right)
\frac{\mathbf{x}_b-\mathbf{x}_{b'}}{d_{bb'}+\epsilon}
$$

这样即使两个蝙蝠重叠，也会因为个体参数、softmax 采样、决策间隔和分离力而快速分化。

### 15.5 捕获规则

如果：

$$
d_{ib}<R_{\text{capture}}
$$

则：

$$
\text{alive}_i=0
$$

被捕获的萤火虫不再参与：

- 相位更新
- 亮度显示
- 邻居图
- order parameter
- local order

---

## 16. 交互工具规则

工具栏：

- `+`：添加萤火虫。
- `-`：通用橡皮擦，擦除半径内的萤火虫、障碍物、城市光源和蝙蝠。
- `O`：添加障碍物。
- `*`：添加城市光源。
- `B`：添加蝙蝠。
- `Inspect`：悬停查看单个萤火虫状态。

数量联动：

- `N` slider 改变会同步实际萤火虫数量。
- 画布添加/擦除萤火虫也会同步回 `N` slider。
- 添加/清除/擦除蝙蝠会同步回 `batCount`。

---

## 17. 当前 metrics

核心 metrics：

```text
r
psi
rLocalMean
avgNeighbors
isolatedCount
flashCount
cityLockDelta
rA
rB
aliveCount
capturedCount
meanPanic
meanNearestBatDistance
batTargetCount
```

解释：

- `aliveCount`：仍存活的萤火虫数量。
- `capturedCount`：已被捕获的萤火虫数量。
- `meanPanic`：平均恐慌程度。
- `meanNearestBatDistance`：活萤火虫到最近蝙蝠的平均距离。
- `batTargetCount`：当前有目标的蝙蝠数量。

---

## 18. 性能与调试规则

为避免浏览器 out-of-memory：

- 默认 `N=125`。
- 默认 `speed=1`。
- Canvas 尺寸受限。
- UI snapshot 约 10 fps 更新；暂停时约 2 fps。
- diagnostics 最多保留 80 条。
- info 级日志不写入 console，避免 DevTools 保留大对象。

崩溃诊断：

- 捕获 browser error。
- 捕获 unhandled promise rejection。
- 捕获 React render crash。
- 主循环 `step()` 或 `getSnapshot()` 抛错时自动暂停。
- 右下角 `Logs` 面板显示最近事件和错误上下文。

---

## 19. 当前实验流程

### Task 1：基础同步

1. 设置低或中等 `N`。
2. 调整 `K` 与 `R_visual`。
3. 观察 $r(t)$ 和 $\bar r_{\text{local}}(t)$。

### Task 2：寻找临界点

扫描 $K$：

$$
\bar r(K)
=
\frac{1}{M_T}
\sum_{t>T_{\text{burn}}}
r(t)
$$

估计：

$$
K_c=\min\{K:\bar r(K)>r_{\text{threshold}}\}
$$

### Task 3：光污染

调整：

$$
\epsilon_{\text{city}},
\qquad
\Omega_{\text{city}}
$$

观察 `Delta_lock`。

### Task 4：树林遮挡

添加障碍物并观察：

$$
r(t)
\quad\text{vs.}\quad
\bar r_{\text{local}}(t)
$$

### Task 5：蝙蝠压力

添加蝙蝠，观察：

```text
aliveCount
capturedCount
meanPanic
meanNearestBatDistance
batTargetCount
r(t)
```

重点现象：

- 蝙蝠感知范围内萤火虫会熄灭并冻结相位。
- 被追逐萤火虫一定移动。
- 多个蝙蝠因为 softmax 策略和 separation 不会长期完全重叠。

---

## 20. 一页 slide 公式

主模型：

$$
\frac{d\theta_i}{dt}
=
\omega_i
+
\frac{K}{k_i}
\sum_j A_{ij}\sin(\theta_j-\theta_i)
+
\xi_i(t)
$$

序参量：

$$
r(t)=
\left|
\frac{1}{N_{\text{alive}}}
\sum_{j:\text{alive}}
e^{i\theta_j(t)}
\right|
$$

移动概率：

$$
P(\text{move})=
\begin{cases}
1,&d_{ib}\le R_{\text{bat\_perception}}\\
p_{\text{move}},&\text{otherwise}
\end{cases}
$$

蝙蝠 softmax 目标选择：

$$
P(j\mid b)
=
\frac{
\exp(s_{bj}/T_{\text{bat}})
}{
\sum_{\ell\in \mathcal{C}_b}
\exp(s_{b\ell}/T_{\text{bat}})
}
$$

一句总结：

$$
\text{synchronization}
\quad\text{emerges from}\quad
\text{local coupling},
\quad
\text{but predators reshape who flashes and who moves.}
$$
