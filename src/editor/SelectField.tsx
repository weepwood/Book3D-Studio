import * as Select from '@radix-ui/react-select'
type Option={value:string;label:string}
export function SelectField({label,value,options,onChange}:{label:string;value:string;options:Option[];onChange:(v:string)=>void}){
 return <Select.Root value={value} onValueChange={onChange}>
  <Select.Trigger aria-label={label} className="select-trigger" data-value={value}><Select.Value/><Select.Icon className="select-chevron" aria-hidden>⌄</Select.Icon></Select.Trigger>
  <Select.Portal><Select.Content className="select-popup" position="popper" sideOffset={5} collisionPadding={8} align="start"><Select.ScrollUpButton className="select-scroll">⌃</Select.ScrollUpButton><Select.Viewport>{options.map(o=><Select.Item key={o.value} value={o.value} data-option-value={o.value} className="select-item"><Select.ItemText>{o.label}</Select.ItemText><Select.ItemIndicator className="select-check">✓</Select.ItemIndicator></Select.Item>)}</Select.Viewport><Select.ScrollDownButton className="select-scroll">⌄</Select.ScrollDownButton></Select.Content></Select.Portal>
 </Select.Root>
}
