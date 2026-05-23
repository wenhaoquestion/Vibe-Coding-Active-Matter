# Physarum C++ Web Prompt Pack

这个文件夹是给后续 Codex 开发用的需求包，不是最终网站实现。

## 文件

- `codex_prompt.md`: 可直接复制给 Codex 的完整开发 prompt。
- `research_notes.md`: 根据用户给出的链接和补充检索整理的资料笔记。
- `model_formula_seed.tex`: 可作为后续 `docs/model.tex` 的公式起点。

## 推荐用法

把 `codex_prompt.md` 整段交给 Codex，让它在一个新的工程目录里实现：

- C++ 仿真核心，编译成 WebAssembly。
- React/Vite/TypeScript 前端。
- 交互式粘菌、食物、能量、生长、搜索、最短营养传输路径模拟。
- LaTeX 公式说明文档。

注意：OpenProcessing 链接在自动检索时被 Cloudflare 阻挡，已在 prompt 中作为视觉/交互参考处理；后续如果浏览器能直接打开，可以人工观察其视觉效果再微调。
