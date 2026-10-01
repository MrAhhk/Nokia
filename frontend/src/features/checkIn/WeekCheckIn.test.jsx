import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import WeekCheckIn from "./WeekCheckIn";
import * as api from "@/lib/launcherApps";
global.IS_REACT_ACT_ENVIRONMENT=true;
let root,container;
beforeEach(()=>{container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();jest.restoreAllMocks();});
test.each(['Yes','Not yet'])("%s keeps review and share equally available",async answer=>{
  const review=jest.spyOn(api,'openAppReview').mockResolvedValue();
  const share=jest.spyOn(api,'shareLauncherApp').mockResolvedValue();
  await act(async()=>root.render(<WeekCheckIn onClose={()=>{}}/>));
  const button=text=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent===text);
  expect(button('Review on Google Play')).toBeDefined();
  await act(async()=>button(answer).click());
  expect(container.textContent).toContain(answer==='Yes'?'meaningful step':'making an effort');
  await act(async()=>button('Share with a friend').click());
  await act(async()=>button('Review on Google Play').click());
  expect(share).toHaveBeenCalledTimes(1);expect(review).toHaveBeenCalledTimes(1);
});
test("physical Back closes and direction/select uses the same buttons",async()=>{
  const ref=createRef(),close=jest.fn();
  await act(async()=>root.render(<WeekCheckIn ref={ref} onClose={close}/>));
  act(()=>{ref.current.handleKey('DOWN');ref.current.handleKey('SELECT');});
  expect(close).toHaveBeenCalledTimes(1);
  act(()=>ref.current.handleKey('BACK'));
  expect(close).toHaveBeenCalledTimes(2);
});
