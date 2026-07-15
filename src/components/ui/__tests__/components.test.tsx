import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from '../Text';
import { Button } from '../Button';
import { Card } from '../Card';
import { Avatar } from '../Avatar';
import { Badge } from '../Badge';
import { Divider } from '../Divider';
import { ScreenWrapper } from '../ScreenWrapper';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

function snap(element: React.ReactElement) {
  return render(element).toJSON();
}

describe('ledger theme', () => {
  it('Text body', () => expect(snap(<Text>Hello</Text>)).toMatchSnapshot());
  it('Text heading1', () => expect(snap(<Text variant="heading1">Title</Text>)).toMatchSnapshot());
  it('Text heading2', () => expect(snap(<Text variant="heading2">Subtitle</Text>)).toMatchSnapshot());
  it('Text heading3', () => expect(snap(<Text variant="heading3">Section</Text>)).toMatchSnapshot());
  it('Text caption', () => expect(snap(<Text variant="caption">Small</Text>)).toMatchSnapshot());
  it('Text label', () => expect(snap(<Text variant="label">Label</Text>)).toMatchSnapshot());
  it('Text mono', () => expect(snap(<Text variant="mono">€12.50</Text>)).toMatchSnapshot());

  it('Button primary', () =>
    expect(snap(<Button label="Pay" onPress={() => {}} />)).toMatchSnapshot());
  it('Button ghost', () =>
    expect(snap(<Button label="Cancel" onPress={() => {}} variant="ghost" />)).toMatchSnapshot());
  it('Button danger', () =>
    expect(snap(<Button label="Delete" onPress={() => {}} variant="danger" />)).toMatchSnapshot());
  it('Button disabled', () =>
    expect(snap(<Button label="Pay" onPress={() => {}} disabled />)).toMatchSnapshot());
  it('Button sm', () =>
    expect(snap(<Button label="Pay" onPress={() => {}} size="sm" />)).toMatchSnapshot());

  it('Card', () => expect(snap(<Card><Text>Content</Text></Card>)).toMatchSnapshot());
  it('Card pressable', () =>
    expect(snap(<Card onPress={() => {}}><Text>Tap me</Text></Card>)).toMatchSnapshot());

  it('Avatar md', () =>
    expect(snap(<Avatar initials="JA" bg="#2d2260" />)).toMatchSnapshot());
  it('Avatar sm', () =>
    expect(snap(<Avatar initials="ML" bg="#1a3a2a" color="#6ee7b7" size="sm" />)).toMatchSnapshot());
  it('Avatar lg', () =>
    expect(snap(<Avatar initials="TC" bg="#3a1a1a" color="#fca5a5" size="lg" />)).toMatchSnapshot());

  it('Badge default', () => expect(snap(<Badge label="Assigned" />)).toMatchSnapshot());
  it('Badge custom', () =>
    expect(snap(<Badge label="€8.50" bg="#3d2200" color="#fbbf24" />)).toMatchSnapshot());

  it('Divider', () => expect(snap(<Divider />)).toMatchSnapshot());

  it('ScreenWrapper', () =>
    expect(snap(<ScreenWrapper><Text>Screen</Text></ScreenWrapper>)).toMatchSnapshot());
});
