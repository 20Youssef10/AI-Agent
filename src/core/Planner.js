/**
 * Planner - Task planning and breakdown engine
 */

import chalk from 'chalk';

export class Planner {
  constructor(groqClient) {
    this.groqClient = groqClient;
    this.plans = [];
  }

  /**
   * Generate a step-by-step plan for a task
   */
  async createPlan(task, context = {}) {
    console.log(chalk.cyan('\n📋 Planning...\n'));
    
    const systemPrompt = `You are a task planning expert. Break down complex tasks into clear, executable steps.

Your job is to:
1. Analyze the user's request
2. Break it down into logical steps
3. Provide actionable instructions
4. Consider dependencies between steps
5. Suggest file operations when relevant

Format your response as:
PLAN: [Brief task summary]

STEPS:
1. [Step description]
2. [Step description]
...

FILES TO CREATE/MODIFY:
- [file path]: [purpose]

CONSIDERATIONS:
- [Important notes or warnings]`;

    const response = await this.groqClient.sendMessage(
      `Task: ${task}\n\nContext: ${JSON.stringify(context, null, 2)}`,
      { systemPrompt, temperature: 0.3 }
    );

    if (response.success) {
      const plan = {
        id: Date.now(),
        task,
        content: response.content,
        context,
        steps: this.parseSteps(response.content),
        createdAt: new Date()
      };
      
      this.plans.push(plan);
      return plan;
    }
    
    throw new Error('Failed to create plan');
  }

  /**
   * Parse steps from plan content
   */
  parseSteps(content) {
    const steps = [];
    const lines = content.split('\n');
    let inStepsSection = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === 'STEPS:') {
        inStepsSection = true;
        continue;
      }
      
      if (inStepsSection) {
        if (trimmed === '' || trimmed.startsWith('FILES') || trimmed.startsWith('CONSIDERATIONS')) {
          inStepsSection = false;
          continue;
        }
        
        const stepMatch = trimmed.match(/^\d+\.\s*(.+)$/);
        if (stepMatch) {
          steps.push(stepMatch[1]);
        }
      }
    }
    
    return steps;
  }

  /**
   * Execute a plan step by step
   */
  async executePlan(planId, fileManager, executor) {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    console.log(chalk.cyan(`\n🚀 Executing Plan: ${plan.task}\n`));
    
    const results = [];
    
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      console.log(chalk.yellow(`\n[Step ${i + 1}/${plan.steps.length}] ${step}`));
      
      const result = await executor.executeStep(step, fileManager, {
        plan,
        stepIndex: i,
        context: plan.context
      });
      
      results.push(result);
      
      if (!result.success) {
        console.log(chalk.red(`\n❌ Step ${i + 1} failed: ${result.error}`));
        return { success: false, completedSteps: i, results };
      }
    }
    
    console.log(chalk.green('\n✅ Plan completed successfully!\n'));
    return { success: true, results };
  }

  /**
   * Get all plans
   */
  getPlans() {
    return this.plans;
  }

  /**
   * Get a specific plan
   */
  getPlan(planId) {
    return this.plans.find(p => p.id === planId);
  }

  /**
   * Clear all plans
   */
  clearPlans() {
    this.plans = [];
    console.log(chalk.gray('All plans cleared'));
  }
}

export default Planner;
