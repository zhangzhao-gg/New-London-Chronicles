/**
 * [INPUT]: M06 共享组件、全局设计 token、静态示例数据
 * [OUTPUT]: 设计系统预览页，提供最小可运行入口与组件验收面
 * [POS]: 位于 `app/page.tsx`，作为当前阶段的根页面
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

"use client";

import { useState } from "react";

import LogEntry from "@/components/hud/LogEntry";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import ResourceIcon from "@/components/ui/ResourceIcon";
import Tooltip from "@/components/ui/Tooltip";

const logs = [
  {
    id: 1,
    userLabel: "王五",
    actionDesc: "在资源区采集了40单位煤炭",
    createdAt: "2026-03-23T13:20:00.000Z",
  },
  {
    id: 2,
    userLabel: "李雷",
    actionDesc: "完成了帐篷建造，为新伦敦增加了新的居所",
    createdAt: "2026-03-23T14:05:00.000Z",
  },
];

const resources = [
  { resource: "coal", amount: 5000 },
  { resource: "wood", amount: 3000 },
  { resource: "steel", amount: 500 },
  { resource: "rawFood", amount: 0 },
  { resource: "foodSupply", amount: 50 },
  { resource: "temperature", amount: "-20°C" },
] as const;

export default function HomePage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-10 sm:px-10">
      <header className="nlc-panel nlc-inset nlc-etched rounded-2xl px-6 py-8 sm:px-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-[0.72rem] uppercase tracking-[0.32em] text-[var(--nlc-muted)]">M06 Preview</p>
            <h1 className="m-0 text-3xl font-semibold uppercase tracking-[0.14em] text-[var(--nlc-orange)]">
              New London Design System
            </h1>
          </div>
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            Open Modal
          </Button>
        </div>
        <p className="m-0 max-w-3xl text-base leading-7 text-[var(--nlc-muted)]">
          当前页面仅用于验证共享 UI 组件、视觉 token 与基础交互，不代表最终业务页面信息架构。
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="nlc-panel rounded-2xl px-6 py-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="m-0 text-xl uppercase tracking-[0.16em] text-[var(--nlc-orange)]">Buttons & Tooltips</h2>
            <Tooltip
              content={
                <div className="space-y-1">
                  <div className="font-semibold text-[var(--nlc-orange)]">资源区</div>
                  <div>当前状态：可采集</div>
                  <div>正在此处工作的人数：3</div>
                </div>
              }
            >
              <Button variant="ghost">District Hover</Button>
            </Tooltip>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">Start Shift</Button>
            <Button variant="secondary">Join Build</Button>
            <Button variant="ghost">Open Archives</Button>
            <Button aria-pressed variant="tab">
              Logistics
            </Button>
            <Button variant="tab">Council</Button>
          </div>
        </div>

        <div className="nlc-panel rounded-2xl px-6 py-6">
          <h2 className="mb-5 mt-0 text-xl uppercase tracking-[0.16em] text-[var(--nlc-orange)]">Resources</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {resources.map((item) => (
              <div key={item.resource} className="nlc-resource-chip justify-between">
                <ResourceIcon amount={item.amount} resource={item.resource} showLabel />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="nlc-panel rounded-2xl px-6 py-6">
        <h2 className="mb-5 mt-0 text-xl uppercase tracking-[0.16em] text-[var(--nlc-orange)]">City Logs</h2>
        <div className="space-y-3">
          {logs.map((entry) => (
            <LogEntry key={entry.id} entry={entry} />
          ))}
        </div>
      </section>

      <Modal
        description="共享 Modal 现已包含遮罩点击关闭、Esc 关闭、首个焦点接管与 Tab 焦点循环。"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>
              Confirm
            </Button>
          </div>
        }
        onClose={() => setModalOpen(false)}
        open={modalOpen}
        title="District Modal"
      >
        <div className="space-y-4 text-sm leading-7 text-[var(--nlc-muted)]">
          <p className="m-0">这里是 M06 通用弹窗预览内容，供后续 M09 区块详情面板直接复用。</p>
          <p className="m-0">它已经满足基础键盘可访问性，避免浮层打开后焦点落回页面背景。</p>
        </div>
      </Modal>
    </main>
  );
}
