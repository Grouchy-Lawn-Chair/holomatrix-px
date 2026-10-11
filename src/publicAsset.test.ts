import {expect,it} from 'vitest'
import {publicAsset} from './publicAsset'

it('resolves root-relative manifest paths under the deployment base',()=>{
  expect(publicAsset('/prop-library/example.json')).toBe(`${import.meta.env.BASE_URL}prop-library/example.json`)
  expect(publicAsset('prop-library/example.json')).toBe(`${import.meta.env.BASE_URL}prop-library/example.json`)
})
