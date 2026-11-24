import {expect,type Locator} from '@playwright/test'
export async function choose(trigger:Locator,value:string){await trigger.click();await trigger.page().getByRole('option').and(trigger.page().locator(`[data-option-value="${value}"]`)).click();await expect(trigger).toHaveAttribute('data-value',value)}
