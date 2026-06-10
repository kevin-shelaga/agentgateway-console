"use client";

import { FlaskConical } from "lucide-react";
import { PageHeader } from "@/components/page-states";
import { LlmPanel } from "@/components/playground/llm-panel";
import { McpPanel } from "@/components/playground/mcp-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function PlaygroundPage() {
  return (
    <div className="flex flex-col gap-5 p-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <FlaskConical className="size-5 text-primary" />
            Playground
          </span>
        }
        description="Send real traffic through a gateway to verify AI and MCP backends end-to-end"
      />

      <Tabs defaultValue="llm">
        <TabsList>
          <TabsTrigger value="llm">LLM</TabsTrigger>
          <TabsTrigger value="mcp">MCP</TabsTrigger>
        </TabsList>
        <TabsContent value="llm">
          <LlmPanel />
        </TabsContent>
        <TabsContent value="mcp">
          <McpPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
